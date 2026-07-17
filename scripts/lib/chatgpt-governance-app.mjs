import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { checkServiceStatuses, loadDashboardState } from "./dashboard-core.mjs";
import { buildResourceCoordinationSnapshot } from "./resource-coordination-core.mjs";
import { executeServiceControl, loadApprovedServiceControls } from "./service-control-core.mjs";

export const GOVERNANCE_PANEL_RESOURCE_URI = "ui://devgov/governance-pulse.html";
export const GOVERNANCE_PANEL_VERSION = "0.2.1";
export const RESTART_CONFIRMATION_TTL_MS = 60_000;

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

export function renderGovernancePanelHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{color-scheme:light;--host-bg:#f7f7f5;--ink:var(--color-text-primary,#171717);--muted:var(--color-text-secondary,#6f6f6f);--line:var(--color-border-secondary,rgba(23,23,23,.14));--soft:var(--color-background-secondary,rgba(23,23,23,.055));--button-bg:var(--color-background-primary,var(--host-bg));--good:#138a5b;--warn:#a96100;--bad:#c43d3d;--host-safe-bottom:0px;font-family:var(--font-sans,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif)}
:root[data-theme="dark"]{color-scheme:dark;--host-bg:#212121;--ink:var(--color-text-primary,#f3f3f3);--muted:var(--color-text-secondary,#b4b4b4);--line:var(--color-border-secondary,rgba(255,255,255,.14));--soft:var(--color-background-secondary,rgba(255,255,255,.07))}
*{box-sizing:border-box;min-width:0}html,body{margin:0;background:var(--color-background-primary,var(--host-bg));color:var(--ink)}body{font-size:13px;line-height:1.45}.shell{width:100%;padding:10px 2px calc(10px + var(--host-safe-bottom) + env(safe-area-inset-bottom));background:inherit}.top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 12px;align-items:start}.identity{display:flex;align-items:center;gap:8px}.title{margin:0;font-size:14px;font-weight:650;letter-spacing:-.01em}.summary{grid-column:1/-1;margin:0;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.pulse{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:600;white-space:nowrap}.dot{width:7px;height:7px;border-radius:50%;background:var(--warn);flex:0 0 auto}.HEALTHY .dot{background:var(--good)}.DEGRADED .dot{background:var(--bad)}.section{padding:10px 0;border-top:1px solid var(--line)}.section:first-of-type{margin-top:10px}.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}.section h2{margin:0;font-size:12px;font-weight:650}.section small,.meta{color:var(--muted);font-size:10px}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px 12px;margin:0}.stat{margin:0}.stat dt{color:var(--muted);font-size:10px;overflow-wrap:anywhere}.stat dd{margin:1px 0 0;font-size:13px;font-weight:600;overflow-wrap:anywhere}.facts{display:flex;flex-wrap:wrap;gap:4px 18px;color:var(--muted);font-size:11px}.facts strong{color:var(--ink);font-weight:600}.full-detail{display:none}.rows{display:grid}.row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:start;padding:7px 0;border-bottom:1px solid var(--line)}.row:last-child{border-bottom:0}.row-mark{width:6px;height:6px;margin-top:5px;border-radius:50%;background:var(--bad)}.row-copy strong{display:block;font-size:12px;font-weight:600;overflow-wrap:anywhere}.row-copy span{display:block;margin-top:1px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}.row-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}.button{min-height:34px;border:1px solid var(--line);border-radius:9px;background:transparent;color:var(--ink);padding:5px 10px;font:inherit;font-size:12px;font-weight:550;cursor:pointer}.button:hover{background:var(--soft)}.button.primary{background:var(--ink);border-color:var(--ink);color:var(--button-bg)}.button.danger{color:var(--bad)}.button.tertiary{min-height:30px;padding:4px 8px;font-size:11px}.button:disabled{cursor:wait;opacity:.5}.notice{margin:8px 0 0;padding:8px 10px;border-left:2px solid var(--line);color:var(--muted);font-size:11px;overflow-wrap:anywhere}.notice[data-state="completed"]{border-color:var(--good)}.notice[data-state="failed"]{border-color:var(--bad)}.confirm{margin-top:8px;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.confirm p{margin:0 0 8px;font-size:12px;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:6px;padding-top:10px;border-top:1px solid var(--line)}.empty{padding:5px 0;color:var(--muted);font-size:11px}.meta{margin-top:7px;overflow-wrap:anywhere}[hidden]{display:none!important}
:root[data-display-mode="fullscreen"] .full-detail{display:block}:root[data-display-mode="fullscreen"] .inline-only{display:none}:root[data-display-mode="fullscreen"] .shell{max-width:1100px;margin-inline:auto;padding-inline:14px}
@media(max-width:460px){.shell{padding-inline:0}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.row{grid-template-columns:8px minmax(0,1fr)}.row-actions{grid-column:2;justify-content:flex-start}.actions .button{flex:1}.section{padding:10px 0}}
@media(max-width:300px){.top{grid-template-columns:1fr}.pulse{justify-self:start}.stats{gap:7px 8px}.row-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.button.tertiary{width:100%}}
</style></head><body><main class="shell"><header class="top"><div class="identity"><h1 class="title" id="title">DevGov governance</h1></div><div class="pulse ATTENTION" id="pulse"><span class="dot" aria-hidden="true"></span><span id="state">Loading</span></div><p class="summary" id="summary">Loading current governance signals…</p></header><section class="section"><div class="section-head"><h2 id="services-title">Services</h2><small id="freshness"></small></div><dl class="stats" id="services"></dl></section><section class="section inline-only"><div class="facts" id="inline-facts"></div></section><section class="section full-detail"><div class="section-head"><h2 id="governance-title">Governance coverage</h2></div><dl class="stats" id="governance"></dl></section><section class="section full-detail"><div class="section-head"><h2 id="capacity-title">Shared capacity</h2></div><dl class="stats" id="capacity"></dl><div class="notice" id="capacity-reasons" hidden></div></section><section class="section"><div class="section-head"><h2 id="attention-title">Needs attention</h2><small id="exception-count"></small></div><div class="rows" id="exceptions"></div></section><div class="notice" id="operation" role="status" aria-live="polite" hidden></div><div class="confirm" id="confirmation" role="alertdialog" aria-labelledby="confirmation-text" hidden><p id="confirmation-text"></p><div class="row-actions"><button class="button tertiary" id="cancel-restart" type="button">Cancel</button><button class="button tertiary danger" id="confirm-restart" type="button">Confirm restart</button></div></div><div class="actions"><button class="button primary" id="refresh" type="button">Refresh</button><button class="button" id="fullscreen" type="button">Manage</button></div><div class="meta" id="meta"></div></main>
<script>
const $=id=>document.getElementById(id);const INLINE_EXCEPTION_LIMIT=2;let pulse=window.openai?.toolOutput||null;let pendingRestart=null;let heightFrame=0;let hostContext={};
const zh=/^zh/i.test(window.openai?.locale||navigator.language||"");
const copy=zh?{title:"DevGov 治理",loading:"正在讀取目前治理訊號…",healthy:"治理訊號正常。",attention:"部分訊號需要重新確認。",degraded:"有高價值例外需要處理。",services:"服務",governance:"治理涵蓋",capacity:"共用資源",attentionTitle:"需要留意",online:"正常",offline:"離線",errors:"錯誤",unknown:"未知",projects:"專案",ports:"Ports",agents:"本機 agents",publicRoutes:"公開路由",protectedRoutes:"受保護路由",candidateRoutes:"候選路由",cpu:"CPU",memory:"記憶體",coordination:"協調狀態",expires:"有效至",clear:"目前沒有高價值例外。",registry:"Registry 驗證",doctor:"Doctor",restart:"Restart",refresh:"重新整理",refreshing:"更新中…",manage:"管理",updated:"更新時間",preparing:"正在準備 Restart 確認…",confirmRestart:"確認 Restart",cancel:"取消",confirmText:"將執行已核准的 Restart：",runningDoctor:"正在執行 Doctor：",runningRestart:"正在執行 Restart：",failed:"操作失敗。",snapshot:"快照",more:"項以上請至管理",coverage:"治理",host:"主機"}:{title:"DevGov governance",loading:"Loading current governance signals…",healthy:"Governance signals are nominal.",attention:"Some signals need a fresh check.",degraded:"High-value exceptions need attention.",services:"Services",governance:"Governance coverage",capacity:"Shared capacity",attentionTitle:"Needs attention",online:"Online",offline:"Offline",errors:"Errors",unknown:"Unknown",projects:"Projects",ports:"Ports",agents:"Local agents",publicRoutes:"Public routes",protectedRoutes:"Protected routes",candidateRoutes:"Candidate routes",cpu:"CPU",memory:"Memory",coordination:"Coordination",expires:"Valid until",clear:"No high-value exceptions in the latest snapshot.",registry:"Registry validation",doctor:"Doctor",restart:"Restart",refresh:"Refresh",refreshing:"Refreshing…",manage:"Manage",updated:"Updated",preparing:"Preparing restart confirmation…",confirmRestart:"Confirm restart",cancel:"Cancel",confirmText:"Run the approved restart for ",runningDoctor:"Running doctor for ",runningRestart:"Restarting ",failed:"Operation failed.",snapshot:"Snapshot",more:"more in Manage",coverage:"Coverage",host:"Host"};
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const value=v=>v===null||v===undefined||v===""?"—":v;
function stat(label,val,suffix){return '<div class="stat"><dt>'+safe(label)+'</dt><dd>'+safe(value(val))+(suffix&&val!==null&&val!==undefined?safe(suffix):'')+'</dd></div>'}
function syncHeight(){cancelAnimationFrame(heightFrame);heightFrame=requestAnimationFrame(()=>window.openai?.notifyIntrinsicHeight?.())}
function applyHostContext(next={}){hostContext={...hostContext,...next};const styles=hostContext.styles||window.openai?.styles;for(const [name,val] of Object.entries(styles?.variables||{})){if(name.startsWith("--")&&typeof val==="string")document.documentElement.style.setProperty(name,val)}const theme=hostContext.theme||window.openai?.theme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;const mode=hostContext.displayMode||window.openai?.displayMode||"inline";document.documentElement.dataset.displayMode=mode;const insets=hostContext.safeAreaInsets||window.openai?.safeAreaInsets;if(Number.isFinite(insets?.bottom))document.documentElement.style.setProperty("--host-safe-bottom",insets.bottom+"px")}
function displayMode(){return document.documentElement.dataset.displayMode||"inline"}
function controlMap(data){return new Map((data.controls||[]).map(item=>[item.controlTargetId,new Set(item.actions||[])]))}
function contextualActions(item,controls){const actions=controls.get(item.controlTargetId);if(!actions)return '';let html='';if(actions.has('doctor'))html+='<button class="button tertiary" type="button" data-control-action="doctor" data-control-target="'+safe(item.controlTargetId)+'" aria-label="'+safe(copy.doctor+' '+item.label)+'">'+copy.doctor+'</button>';if(actions.has('restart'))html+='<button class="button tertiary danger" type="button" data-control-action="restart" data-control-target="'+safe(item.controlTargetId)+'" aria-label="'+safe(copy.restart+' '+item.label)+'">'+copy.restart+'</button>';return html?'<div class="row-actions">'+html+'</div>':''}
function issueRow(item,controls){return '<div class="row"><span class="row-mark" aria-hidden="true"></span><div class="row-copy"><strong>'+safe(item.label)+'</strong><span>'+safe(item.project)+' · '+safe(item.state)+' · '+safe(item.detail)+'</span></div>'+contextualActions(item,controls)+'</div>'}
function render(data){if(!data||data.schema!=="devgov.governance-pulse.v1")return;pulse=data;$("title").textContent=copy.title;$("services-title").textContent=copy.services;$("governance-title").textContent=copy.governance;$("capacity-title").textContent=copy.capacity;$("attention-title").textContent=copy.attentionTitle;$("refresh").textContent=copy.refresh;$("fullscreen").textContent=copy.manage;$("cancel-restart").textContent=copy.cancel;$("confirm-restart").textContent=copy.confirmRestart;$("summary").textContent=data.overallState==="HEALTHY"?copy.healthy:data.overallState==="ATTENTION"?copy.attention:copy.degraded;$("state").textContent=data.overallState;$("pulse").className="pulse "+data.overallState;$("services").innerHTML=stat(copy.online,data.services.online)+stat(copy.offline,data.services.offline)+stat(copy.errors,data.services.errors)+stat(copy.unknown,data.services.unknown);$("governance").innerHTML=stat(copy.projects,data.governance.registeredProjects)+stat(copy.ports,data.governance.registeredPorts)+stat(copy.agents,data.governance.localAgents)+stat(copy.publicRoutes,data.governance.publicRoutes)+stat(copy.protectedRoutes,data.governance.protectedRoutes)+stat(copy.candidateRoutes,data.governance.candidateRoutes);$("capacity").innerHTML=stat(copy.cpu,data.coordination.cpuPercent,"%")+stat(copy.memory,data.coordination.memoryPercent,"%")+stat(copy.coordination,data.coordination.state)+stat(copy.expires,data.coordination.expiresAt?new Date(data.coordination.expiresAt).toLocaleTimeString():copy.snapshot);$("inline-facts").innerHTML='<span><strong>'+safe(copy.coverage)+'</strong> · '+safe(data.governance.registeredProjects)+' '+safe(copy.projects)+' · '+safe(data.governance.registeredPorts)+' '+safe(copy.ports)+' · '+safe(data.governance.protectedRoutes)+' '+safe(copy.protectedRoutes)+'</span><span><strong>'+safe(copy.host)+'</strong> · '+safe(copy.cpu)+' '+safe(value(data.coordination.cpuPercent))+'% · '+safe(copy.memory)+' '+safe(value(data.coordination.memoryPercent))+'% · '+safe(data.coordination.state)+'</span>';const reasons=data.coordination.reasons||[];$("capacity-reasons").hidden=!reasons.length;$("capacity-reasons").textContent=reasons.join(" · ");const controls=controlMap(data);const issues=[...(data.exceptions||[]),...(data.registryErrors||[]).map((detail,i)=>({id:"registry-"+i,label:copy.registry,project:"DevGov",state:"ERROR",detail}))];const inline=displayMode()==="inline";const visibleIssues=inline?issues.slice(0,INLINE_EXCEPTION_LIMIT):issues;const hiddenCount=issues.length-visibleIssues.length;$("exception-count").textContent=issues.length?(inline&&hiddenCount?visibleIssues.length+"/"+issues.length+" · "+hiddenCount+" "+copy.more:String(issues.length)):"✓";$("exceptions").innerHTML=visibleIssues.length?visibleIssues.map(item=>issueRow(item,controls)).join(""):'<div class="empty">'+copy.clear+'</div>';$("freshness").textContent=data.generatedAt?new Date(data.generatedAt).toLocaleTimeString():copy.snapshot;$("meta").textContent=copy.updated+" "+new Date(data.generatedAt).toLocaleString();window.openai?.setWidgetState?.({lastView:inline?"pulse":"manage",lastRefresh:data.generatedAt,lastOperation:window.openai?.widgetState?.lastOperation||null});syncHeight()}
function setTargetBusy(target,busy){document.querySelectorAll('[data-control-target="'+CSS.escape(target)+'"]').forEach(button=>button.disabled=busy)}
function showOperation(message,state){const node=$("operation");node.hidden=false;node.dataset.state=state||"pending";node.textContent=message;window.openai?.setWidgetState?.({lastView:"pulse",lastRefresh:pulse?.generatedAt||null,lastOperation:{state:state||"pending",message}});syncHeight()}
function operationFrom(result){return result?.structuredContent?.operation||result?.toolOutput?.operation||null}
async function refreshPulse(){const button=$("refresh");button.disabled=true;button.textContent=copy.refreshing;try{const result=await window.openai?.callTool?.("refresh_governance_pulse",{});const next=result?.structuredContent??window.openai?.toolOutput;if(next)render(next)}catch(error){showOperation(error?.message||copy.failed,"failed")}finally{button.disabled=false;button.textContent=copy.refresh;syncHeight()}}
async function runDoctor(target){setTargetBusy(target,true);showOperation(copy.runningDoctor+target,"pending");try{const operation=operationFrom(await window.openai?.callTool?.("run_governance_doctor",{controlTargetId:target}));if(!operation||operation.status==="failed")throw new Error(operation?.summary||copy.failed);showOperation(operation.summary,"completed");await refreshPulse()}catch(error){showOperation(error?.message||copy.failed,"failed")}finally{setTargetBusy(target,false)}}
async function prepareRestart(target){setTargetBusy(target,true);showOperation(copy.preparing,"pending");try{const operation=operationFrom(await window.openai?.callTool?.("prepare_governance_restart",{controlTargetId:target}));if(!operation||operation.status==="failed")throw new Error(operation?.summary||copy.failed);pendingRestart=operation;$("confirmation-text").textContent=copy.confirmText+target+".";$("confirmation").hidden=false;$("operation").hidden=true;$("confirm-restart").focus();syncHeight()}catch(error){showOperation(error?.message||copy.failed,"failed")}finally{setTargetBusy(target,false)}}
async function confirmRestart(){if(!pendingRestart)return;const current=pendingRestart;$("confirm-restart").disabled=true;$("cancel-restart").disabled=true;showOperation(copy.runningRestart+current.controlTargetId,"pending");try{const operation=operationFrom(await window.openai?.callTool?.("restart_governed_service",{controlTargetId:current.controlTargetId,confirmationToken:current.confirmationToken}));if(!operation||operation.status==="failed")throw new Error(operation?.summary||copy.failed);showOperation(operation.summary,"completed");$("confirmation").hidden=true;pendingRestart=null;await refreshPulse()}catch(error){showOperation(error?.message||copy.failed,"failed")}finally{$("confirm-restart").disabled=false;$("cancel-restart").disabled=false;syncHeight()}}
function cancelRestart(){pendingRestart=null;$("confirmation").hidden=true;$("operation").hidden=true;syncHeight()}
$("exceptions").addEventListener("click",event=>{const button=event.target.closest("[data-control-action]");if(!button)return;const target=button.dataset.controlTarget;if(button.dataset.controlAction==="doctor")runDoctor(target);if(button.dataset.controlAction==="restart")prepareRestart(target)});$("refresh").onclick=refreshPulse;$("fullscreen").onclick=async()=>{const result=await window.openai?.requestDisplayMode?.({mode:"fullscreen"});applyHostContext({displayMode:result?.mode||"fullscreen"});if(pulse)render(pulse)};$("confirm-restart").onclick=confirmRestart;$("cancel-restart").onclick=cancelRestart;window.addEventListener("openai:set_globals",event=>{const globals=event.detail?.globals||{};applyHostContext(globals);const next=globals.toolOutput??window.openai?.toolOutput;if(next)render(next);else if(pulse)render(pulse)});applyHostContext({theme:window.openai?.theme,styles:window.openai?.styles,displayMode:window.openai?.displayMode,safeAreaInsets:window.openai?.safeAreaInsets});new ResizeObserver(syncHeight).observe(document.documentElement);if(pulse)render(pulse);else syncHeight();
</script></body></html>`;
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
