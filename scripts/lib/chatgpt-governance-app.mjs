import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { checkServiceStatuses, loadDashboardState } from "./dashboard-core.mjs";
import { renderGovernancePanelHtml } from "./chatgpt-governance-panel.mjs";
import {
  buildGovernanceWorkspaceView,
  buildWorkspacePathPrediction,
  GOVERNANCE_WORKSPACE_VIEWS
} from "./governance-workspace-core.mjs";
import { buildResourceCoordinationSnapshot } from "./resource-coordination-core.mjs";
import { executeServiceControl, loadApprovedServiceControls } from "./service-control-core.mjs";

export const GOVERNANCE_PANEL_RESOURCE_URI = "ui://devgov/governance-pulse.html";
export const GOVERNANCE_PANEL_VERSION = "0.3.0";
export const RESTART_CONFIRMATION_TTL_MS = 60_000;
export { renderGovernancePanelHtml };

const restartConfirmations = new Map();

export function buildGovernancePulse({ state, serviceStatus, resourceSnapshot, approvedControls = [] }) {
  const services = Array.isArray(serviceStatus?.services) ? serviceStatus.services : [];
  const serviceCounts = countByState(services, (service) => service.quickTest?.state ?? service.live?.state ?? "UNKNOWN");
  const exceptions = services
    .filter((service) => ["OFFLINE", "ERROR"].includes(service.quickTest?.state ?? service.live?.state))
    .map((service) => ({
      id: service.id,
      controlTargetId: service.controlTargetId ?? service.id,
      label: service.label,
      project: service.project,
      state: service.quickTest?.state ?? service.live?.state,
      latencyMs: service.quickTest?.latencyMs ?? service.live?.latencyMs ?? null,
      detail: service.quickTest?.detail ?? service.live?.detail ?? service.quickTest?.notes ?? "No diagnostic detail."
    }))
    .slice(0, 6);
  const registryErrors = Array.isArray(resourceSnapshot?.registryErrors) ? resourceSnapshot.registryErrors : [];
  const coordinationState = resourceSnapshot?.coordinationState ?? "UNKNOWN";
  const overallState = exceptions.length || registryErrors.length || coordinationState === "CONGESTED"
    ? "DEGRADED"
    : coordinationState === "BUSY" || (serviceCounts.UNKNOWN ?? 0) > 0
      ? "ATTENTION"
      : "HEALTHY";
  const routes = Array.isArray(state?.publicRoutes) ? state.publicRoutes : [];
  const controls = buildPulseControls(exceptions, approvedControls);

  return {
    schema: "devgov.governance-pulse.v1",
    generatedAt: resourceSnapshot?.generatedAt ?? serviceStatus?.generatedAt ?? new Date().toISOString(),
    overallState,
    summary: overallState === "HEALTHY"
      ? "Governance signals are nominal."
      : overallState === "ATTENTION"
        ? "Some signals need a fresh check."
        : `${exceptions.length + registryErrors.length} high-value exception(s) need attention.`,
    services: {
      total: services.length,
      online: serviceCounts.ONLINE ?? 0,
      offline: serviceCounts.OFFLINE ?? 0,
      errors: serviceCounts.ERROR ?? 0,
      unknown: (serviceCounts.UNKNOWN ?? 0) + (serviceCounts.MISSING ?? 0) + (serviceCounts.CHECKING ?? 0)
    },
    governance: {
      registeredProjects: state?.summary?.registeredProjects ?? 0,
      registeredPorts: state?.summary?.ports ?? 0,
      localAgents: state?.summary?.localAgents ?? 0,
      publicRoutes: routes.length,
      protectedRoutes: routes.filter((route) => route.accessRequired).length,
      candidateRoutes: routes.filter((route) => route.status === "candidate").length
    },
    coordination: {
      state: coordinationState,
      cpuPercent: roundMetric(resourceSnapshot?.host?.cpuPercent),
      memoryPercent: roundMetric(resourceSnapshot?.host?.memoryUsedPercent),
      expiresAt: resourceSnapshot?.expiresAt ?? null,
      reasons: Array.isArray(resourceSnapshot?.reasons) ? resourceSnapshot.reasons.slice(0, 3) : []
    },
    exceptions,
    registryErrors: registryErrors.slice(0, 4),
    controls,
    links: {
      dashboard: state?.app?.url ?? "http://127.0.0.1:3000"
    }
  };
}

export async function loadGovernancePulse(root = ".", options = {}) {
  const [state, serviceStatus, resourceSnapshot, approvedControls] = await Promise.all([
    loadDashboardState(root),
    checkServiceStatuses(root, { timeoutMs: options.timeoutMs ?? 1400 }),
    buildResourceCoordinationSnapshot(root, { sampleMs: options.sampleMs ?? 50, includeProcessFamilies: false }),
    loadApprovedServiceControls(root)
  ]);
  return buildGovernancePulse({ state, serviceStatus, resourceSnapshot, approvedControls });
}

export async function loadGovernanceWorkspaceView(root = ".", options = {}) {
  const [state, serviceStatus, resourceSnapshot, approvedControls] = await Promise.all([
    loadDashboardState(root),
    checkServiceStatuses(root, { timeoutMs: options.timeoutMs ?? 1400 }),
    buildResourceCoordinationSnapshot(root, { sampleMs: options.sampleMs ?? 50, includeProcessFamilies: false }),
    loadApprovedServiceControls(root)
  ]);
  return buildGovernanceWorkspaceView(
    { state, serviceStatus, resourceSnapshot, approvedControls },
    options
  );
}

export function createGovernanceAppServer(root = ".") {
  const server = new McpServer({ name: "devgov-governance-panel", version: GOVERNANCE_PANEL_VERSION });
  const getPulse = async () => {
    const pulse = await loadGovernancePulse(root);
    return {
      content: [{ type: "text", text: `${pulse.overallState}: ${pulse.summary}` }],
      structuredContent: pulse
    };
  };

  registerAppResource(server, "DevGov Governance Pulse", GOVERNANCE_PANEL_RESOURCE_URI, {
    description: "Responsive, read-only DevGov governance summary for ChatGPT desktop and mobile."
  }, async () => ({
    contents: [{
      uri: GOVERNANCE_PANEL_RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: renderGovernancePanelHtml(),
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } }
    }]
  }));

  registerAppTool(server, "show_governance_pulse", {
    title: "Show governance pulse",
    description: "Show the highest-value DevGov health, exception, route, and resource signals in a compact visual panel.",
    inputSchema: { includeDetails: z.boolean().optional() },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { resourceUri: GOVERNANCE_PANEL_RESOURCE_URI, visibility: ["model", "app"] } }
  }, getPulse);

  registerAppTool(server, "refresh_governance_pulse", {
    title: "Refresh governance pulse",
    description: "Refresh the current read-only DevGov governance pulse.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { visibility: ["app"] } }
  }, getPulse);

  registerAppTool(server, "query_governance_workspace", {
    title: "Query governance workspace",
    description: "Load one sanitized, filtered, paginated DevGov governance view for the embedded workspace.",
    inputSchema: {
      viewId: z.enum(GOVERNANCE_WORKSPACE_VIEWS.map((view) => view.id)).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      pageSize: z.number().int().min(1).max(10).optional(),
      query: z.string().max(80).optional()
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { visibility: ["app"] } }
  }, async ({ viewId, page, pageSize, query }) => {
    const workspace = await loadGovernanceWorkspaceView(root, { viewId, page, pageSize, query });
    return {
      content: [{ type: "text", text: `${workspace.view.label}: ${workspace.view.page.totalRows} governed record(s).` }],
      structuredContent: workspace
    };
  });

  registerAppTool(server, "predict_governance_workspace_path", {
    title: "Predict workspace governance",
    description: "Classify one operator-supplied workspace path against the loaded DevGov governance model without reading that path.",
    inputSchema: { workspacePath: z.string().max(240) },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { visibility: ["app"] } }
  }, async ({ workspacePath }) => {
    const state = await loadDashboardState(root);
    const prediction = buildWorkspacePathPrediction(state, workspacePath);
    return {
      content: [{ type: "text", text: `${prediction.state}: ${prediction.summary}` }],
      structuredContent: { prediction }
    };
  });

  registerAppTool(server, "run_governance_doctor", {
    title: "Run governed doctor",
    description: "Run one approved, read-only DevGov doctor action for a currently surfaced exception.",
    inputSchema: { controlTargetId: z.string().min(1).max(120) },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { visibility: ["app"] } }
  }, async ({ controlTargetId }) => runGovernanceOperation(root, controlTargetId, "doctor"));

  registerAppTool(server, "prepare_governance_restart", {
    title: "Prepare governed restart",
    description: "Create a short-lived confirmation for one approved DevGov restart action without restarting anything.",
    inputSchema: { controlTargetId: z.string().min(1).max(120) },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { visibility: ["app"] } }
  }, async ({ controlTargetId }) => prepareGovernanceRestart(root, controlTargetId));

  registerAppTool(server, "restart_governed_service", {
    title: "Restart governed service",
    description: "Restart one approved DevGov target using a short-lived, single-use confirmation bound to that target.",
    inputSchema: {
      controlTargetId: z.string().min(1).max(120),
      confirmationToken: z.string().uuid()
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: { ui: { visibility: ["app"] } }
  }, async ({ controlTargetId, confirmationToken }) => runGovernanceOperation(root, controlTargetId, "restart", confirmationToken));

  return server;
}

export function buildPulseControls(exceptions = [], approvedControls = []) {
  const exceptionTargets = new Map(
    exceptions
      .filter((item) => typeof item.controlTargetId === "string" && item.controlTargetId)
      .map((item) => [item.controlTargetId, item.label])
  );
  const actionsByTarget = new Map();
  for (const entry of approvedControls) {
    if (!entry?.approved || entry.status !== "approved" || !exceptionTargets.has(entry.controlTargetId)) continue;
    if (!['doctor', 'restart'].includes(entry.action)) continue;
    if (entry.action === "restart" && !isRestartPolicyReady(entry)) continue;
    const actions = actionsByTarget.get(entry.controlTargetId) ?? new Set();
    actions.add(entry.action);
    actionsByTarget.set(entry.controlTargetId, actions);
  }
  return [...actionsByTarget.entries()]
    .map(([controlTargetId, actions]) => ({
      controlTargetId,
      label: exceptionTargets.get(controlTargetId),
      actions: [...actions].sort()
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function issueRestartConfirmation(controlTargetId, controls, options = {}) {
  const allowed = controls.some((control) => control.controlTargetId === controlTargetId && control.actions.includes("restart"));
  if (!allowed) throw new Error(`Restart is not available for ${controlTargetId}.`);
  cleanupRestartConfirmations(options.now ?? Date.now());
  const createdAtMs = options.now ?? Date.now();
  const token = options.token ?? randomUUID();
  const confirmation = {
    token,
    controlTargetId,
    createdAtMs,
    expiresAtMs: createdAtMs + RESTART_CONFIRMATION_TTL_MS
  };
  restartConfirmations.set(token, confirmation);
  return {
    controlTargetId,
    confirmationToken: token,
    expiresAt: new Date(confirmation.expiresAtMs).toISOString()
  };
}

export function consumeRestartConfirmation(controlTargetId, confirmationToken, approvedControls, options = {}) {
  const now = options.now ?? Date.now();
  cleanupRestartConfirmations(now);
  const confirmation = restartConfirmations.get(confirmationToken);
  if (!confirmation) throw new Error("Restart confirmation is missing, expired, or already used.");
  restartConfirmations.delete(confirmationToken);
  if (confirmation.controlTargetId !== controlTargetId) throw new Error("Restart confirmation does not match the requested target.");
  const approved = approvedControls.some((entry) => entry.controlTargetId === controlTargetId
    && entry.action === "restart"
    && entry.approved
    && entry.status === "approved"
    && isRestartPolicyReady(entry));
  if (!approved) throw new Error(`Restart is no longer approved for ${controlTargetId}.`);
  return true;
}

export function clearRestartConfirmations() {
  restartConfirmations.clear();
}

async function prepareGovernanceRestart(root, controlTargetId) {
  try {
    const pulse = await loadGovernancePulse(root);
    const confirmation = issueRestartConfirmation(controlTargetId, pulse.controls);
    return {
      content: [{ type: "text", text: `Restart confirmation prepared for ${controlTargetId}.` }],
      structuredContent: { operation: { action: "restart", status: "confirmation-required", ...confirmation } }
    };
  } catch (error) {
    return operationErrorResult(controlTargetId, "restart", error);
  }
}

async function runGovernanceOperation(root, controlTargetId, action, confirmationToken = "") {
  try {
    const approvedControls = await loadApprovedServiceControls(root);
    if (action === "doctor") {
      const pulse = await loadGovernancePulse(root);
      const allowed = pulse.controls.some((control) => control.controlTargetId === controlTargetId && control.actions.includes("doctor"));
      if (!allowed) throw new Error(`Doctor is not available for ${controlTargetId}.`);
    } else {
      consumeRestartConfirmation(controlTargetId, confirmationToken, approvedControls);
    }
    const result = await executeServiceControl(root, { controlTargetId, action }, { origin: "mcp-app", clientIp: "loopback-app" });
    const operation = {
      controlTargetId,
      action,
      status: result.ok ? "completed" : "failed",
      summary: sanitizeOperationSummary(result.summary),
      eventId: result.eventId ?? null,
      completedAt: new Date().toISOString()
    };
    return {
      content: [{ type: "text", text: `${action} ${operation.status} for ${controlTargetId}: ${operation.summary}` }],
      structuredContent: { operation }
    };
  } catch (error) {
    return operationErrorResult(controlTargetId, action, error);
  }
}

function operationErrorResult(controlTargetId, action, error) {
  const summary = sanitizeOperationSummary(error?.message ?? error);
  return {
    isError: true,
    content: [{ type: "text", text: `${action} failed for ${controlTargetId}: ${summary}` }],
    structuredContent: {
      operation: { controlTargetId, action, status: "failed", summary, completedAt: new Date().toISOString() }
    }
  };
}

function sanitizeOperationSummary(value) {
  return String(value ?? "No operation detail.")
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[local path]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function isRestartPolicyReady(entry = {}) {
  const policy = entry.restartPolicy ?? {};
  return [policy.permissionBoundary, policy.backupExpectation, policy.rollbackExpectation]
    .every((value) => typeof value === "string" && value.trim());
}

function cleanupRestartConfirmations(now) {
  for (const [token, confirmation] of restartConfirmations) {
    if (confirmation.expiresAtMs <= now) restartConfirmations.delete(token);
  }
}

export async function handleGovernanceMcpRequest(request, response, root = ".") {
  if (request.method === "OPTIONS") {
    response.writeHead(204, mcpCorsHeaders());
    response.end();
    return;
  }
  if (!["POST", "GET", "DELETE"].includes(request.method ?? "")) {
    response.writeHead(405, { ...mcpCorsHeaders(), allow: "POST, GET, DELETE, OPTIONS" });
    response.end();
    return;
  }

  for (const [name, value] of Object.entries(mcpCorsHeaders())) response.setHeader(name, value);
  const server = createGovernanceAppServer(root);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  response.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function countByState(items, selector) {
  return items.reduce((counts, item) => {
    const state = String(selector(item) ?? "UNKNOWN").toUpperCase();
    counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, {});
}

function roundMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function mcpCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version",
    "access-control-expose-headers": "Mcp-Session-Id",
    "cache-control": "no-store"
  };
}
