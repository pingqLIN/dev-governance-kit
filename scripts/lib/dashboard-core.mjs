import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { loadApprovedServiceControls, SERVICE_CONTROL_HOST, SERVICE_CONTROL_PORT, SERVICE_CONTROL_URL } from "./service-control-core.mjs";

export const DASHBOARD_HOST = "127.0.0.1";
export const DASHBOARD_PORT = 3000;
export const DASHBOARD_URL = `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`;

export async function loadDashboardState(root = ".") {
  const [pkg, ports, startup, publicRoutes, terminalProfiles, localAgents, apiKeys, agentInstructions, serviceOnboarding, serviceControls] = await Promise.all([
    readJson(path.join(root, "package.json")),
    readJson(path.join(root, "registry", "ports.registry.json")),
    readJson(path.join(root, "registry", "startup.registry.json")),
    readJson(path.join(root, "registry", "public-routes.registry.json")),
    readJson(path.join(root, "registry", "terminal-profiles.registry.json")),
    readJson(path.join(root, "registry", "local-agents.registry.json")),
    readJson(path.join(root, "registry", "api-keys.registry.json")),
    readJson(path.join(root, "registry", "agent-instructions.registry.json")),
    readJson(path.join(root, "registry", "service-onboarding.registry.json")),
    loadApprovedServiceControls(root)
  ]);
  const webConsoleEvents = await readDashboardEvents(path.join(root, "reports", "web-console-events.json"));
  const localFileCompanions = await buildLocalFileCompanions(root, [
    agentInstructions.sourceOfTruth,
    ...agentInstructions.entries.map((entry) => entry.evidence)
  ]);
  const workspacePrediction = buildWorkspaceGovernancePredictionModel(agentInstructions);

  const dashboardPort = ports.entries.find((entry) => (
    entry.project === "devgov"
    && entry.service === "dashboard-http"
  ));
  const webEntrypoints = buildWebEntrypoints({
    dashboardPort,
    publicRoutes: publicRoutes.routes
  });
  const serviceTargets = buildServiceTargets({
    dashboardPort,
    publicRoutes: publicRoutes.routes,
    localAgents: localAgents.agents,
    startupEntries: startup.entries,
    onboardingEntries: serviceOnboarding.entries,
    ports: ports.entries,
    serviceControls
  });
  const registeredProjects = buildRegisteredProjects({
    onboardingEntries: serviceOnboarding.entries,
    ports: ports.entries,
    publicRoutes: publicRoutes.routes,
    localAgents: localAgents.agents,
    startupEntries: startup.entries,
    serviceTargets
  });

  return {
    app: {
      name: "DevGov",
      packageName: pkg.name,
      version: pkg.version,
      url: DASHBOARD_URL
    },
    dashboardPort,
    summary: {
      ports: ports.entries.length,
      startupEntries: startup.entries.length,
      publicRoutes: publicRoutes.routes.length,
      terminalProfiles: terminalProfiles.profiles.length,
      localAgents: localAgents.agents.length,
      apiKeys: apiKeys.entries.length,
      agentInstructions: agentInstructions.entries.length,
      workspacePredictionRules: workspacePrediction.rules.length,
      registeredProjects: registeredProjects.length,
      webEntrypoints: webEntrypoints.length,
      webConsoleEvents: webConsoleEvents.length
    },
    ports: ports.entries,
    startupEntries: startup.entries,
    publicRoutes: publicRoutes.routes,
    terminalProfiles: terminalProfiles.profiles,
    localAgents: localAgents.agents,
    apiKeys: apiKeys.entries,
    agentInstructions: {
      sourceOfTruth: agentInstructions.sourceOfTruth,
      layers: agentInstructions.layers,
      itemTypes: agentInstructions.itemTypes,
      entries: agentInstructions.entries
    },
    serviceControl: {
      baseUrl: SERVICE_CONTROL_URL,
      entries: serviceControls
    },
    workspacePrediction,
    registeredProjects,
    localFileCompanions,
    webConsoleEvents,
    webEntrypoints,
    serviceTargets
  };
}

async function buildLocalFileCompanions(root, values = []) {
  const companions = {};
  for (const value of values) {
    const pathPart = localDashboardFilePathPart(value);
    if (!pathPart || !pathPart.endsWith(".md") || pathPart.endsWith(".zh-tw.md")) continue;
    if (!isDashboardFileRefAllowed(pathPart)) continue;

    const companion = pathPart.replace(/\.md$/, ".zh-tw.md");
    if (!isDashboardFileRefAllowed(companion)) continue;
    if (await fileExists(path.join(root, companion))) companions[pathPart] = companion;
  }
  return companions;
}

function localDashboardFilePathPart(value) {
  const text = String(value ?? "");
  let pathPart = text.split("#")[0];
  if (pathPart.startsWith("devgov/")) pathPart = pathPart.slice("devgov/".length);
  return pathPart;
}

function isDashboardFileRefAllowed(pathPart) {
  return /^(?:AGENTS|README)\.zh-tw\.md$|^(?:AGENTS|README)\.md$|^package\.json$|^(?:registry|scripts|templates|docs|reports)\/[A-Za-z0-9._\/-]+\.(?:md|json|txt|yml|yaml|mjs|ps1|html)$/.test(pathPart);
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export function buildWebEntrypoints({ dashboardPort, publicRoutes = [] }) {
  const entries = [];
  if (dashboardPort) {
    entries.push({
      id: "devgov-dashboard-local",
      project: "devgov",
      label: "DevGov Dashboard",
      stage: "local",
      url: DASHBOARD_URL,
      healthUrl: `${dashboardPort.protocol}://${dashboardPort.host}:${dashboardPort.port}/health`,
      target: `${dashboardPort.host}:${dashboardPort.port}`,
      exposureClass: dashboardPort.visibility,
      accessRequired: false,
      status: "approved",
      notes: dashboardPort.notes
    });
  }

  for (const route of publicRoutes) {
    entries.push({
      id: route.id,
      project: webEntrypointProject(route),
      label: route.hostname,
      stage: inferRouteStage(route),
      url: route.healthUrl,
      healthUrl: route.healthUrl,
      target: `${route.localHost}:${route.localPort}`,
      exposureClass: route.exposureClass,
      accessRequired: route.accessRequired,
      status: route.status,
      notes: route.notes
    });
  }

  const rank = new Map([
    ["devgov", 0],
    ["tb2", 1]
  ]);
  return entries.sort((left, right) => (
    (rank.get(left.project) ?? 9) - (rank.get(right.project) ?? 9)
    || left.project.localeCompare(right.project)
    || left.label.localeCompare(right.label)
  ));
}

const serviceStatusKindOrder = new Map([
  ["dashboard", 0],
  ["local-agent", 1],
  ["public-route", 2],
  ["local-web-ui", 3],
  ["portable-runtime", 4],
  ["preview-runtime", 5],
  ["vite-dev-runtime", 6],
  ["runtime-command", 7],
  ["hardware-observation", 8]
]);

function sortServiceTargetsForDashboard(targets = []) {
  return targets.sort((left, right) => (
    (serviceStatusKindOrder.get(left.kind) ?? 99) - (serviceStatusKindOrder.get(right.kind) ?? 99)
    || (left.project || "").localeCompare(right.project || "")
    || (left.label || "").localeCompare(right.label || "")
  ));
}

export function buildRegisteredProjects({ onboardingEntries = [], ports = [], publicRoutes = [], localAgents = [], startupEntries = [], serviceTargets = [] } = {}) {
  const projects = new Map();
  const publicRouteProjectByTargetId = new Map(publicRoutes.map((route) => [`public-route:${route.id}`, webEntrypointProject(route)]));

  for (const entry of onboardingEntries) {
    const project = ensureRegisteredProject(projects, entry.project);
    project.onboardingEntries.push(entry.id);
    project.services.add(entry.service);
    project.ownerKinds.add(entry.ownerKind);
    project.sourceRefs.add(entry.sourceRef);
    project.reviewEvidence.add(entry.reviewEvidence);
    project.nextActions.push(entry.nextAction);
    increment(project.readinessCounts, entry.readiness || "UNKNOWN");
    increment(project.reviewStatusCounts, entry.reviewStatus || "unknown");
  }

  for (const port of ports) {
    const project = ensureRegisteredProject(projects, port.project);
    project.ports.push(`${port.host}:${port.port}`);
    project.services.add(port.service);
    project.visibilities.add(port.visibility);
    project.sourceRefs.add(`registry/ports.registry.json#${port.project}:${port.service}`);
  }

  for (const route of publicRoutes) {
    const projectId = webEntrypointProject(route);
    const project = ensureRegisteredProject(projects, projectId);
    project.publicRoutes.push(route.hostname);
    project.visibilities.add(route.exposureClass || "public-route");
  }

  for (const agent of localAgents) {
    const project = ensureRegisteredProject(projects, agent.project);
    project.localAgents.push(agent.displayName);
    project.services.add(agent.serviceId);
    project.sourceRefs.add(`registry/local-agents.registry.json#${agent.id}`);
    increment(project.reviewStatusCounts, agent.status || "unknown");
  }

  for (const startup of startupEntries) {
    const project = ensureRegisteredProject(projects, startup.project);
    project.startupRefs.push(startup.id);
    project.sourceRefs.add(`registry/startup.registry.json#${startup.id}`);
  }

  for (const target of serviceTargets) {
    const projectId = publicRouteProjectByTargetId.get(target.id) || target.project;
    const project = ensureRegisteredProject(projects, projectId);
    project.serviceTargets.push(target.id);
    increment(project.controlReadinessCounts, target.controlReadiness || "UNKNOWN");
  }

  return [...projects.values()]
    .map(finalizeRegisteredProject)
    .sort((left, right) => (
      progressRank(left.progressTag) - progressRank(right.progressTag)
      || left.project.localeCompare(right.project)
    ));
}

function ensureRegisteredProject(projects, projectId) {
  const id = String(projectId || "unknown-project");
  if (!projects.has(id)) {
    projects.set(id, {
      id,
      project: id,
      services: new Set(),
      ownerKinds: new Set(),
      visibilities: new Set(),
      sourceRefs: new Set(),
      reviewEvidence: new Set(),
      nextActions: [],
      readinessCounts: new Map(),
      reviewStatusCounts: new Map(),
      controlReadinessCounts: new Map(),
      onboardingEntries: [],
      ports: [],
      publicRoutes: [],
      localAgents: [],
      startupRefs: [],
      serviceTargets: []
    });
  }
  return projects.get(id);
}

function finalizeRegisteredProject(project) {
  const readinessCounts = mapToObject(project.readinessCounts);
  const reviewStatusCounts = mapToObject(project.reviewStatusCounts);
  const controlReadinessCounts = mapToObject(project.controlReadinessCounts);
  const progressTag = aggregateProjectProgress(project.readinessCounts, project.controlReadinessCounts);
  const progressPercent = projectProgressPercent(project.readinessCounts, project.controlReadinessCounts);
  const reviewTags = sortedKeys(project.reviewStatusCounts);
  const visibilityTags = [...project.visibilities].filter(Boolean).sort();
  const ownerTags = [...project.ownerKinds].filter(Boolean).sort();

  return {
    id: project.id,
    project: project.project,
    progressTag,
    progressPercent,
    readinessCounts,
    controlReadinessCounts,
    reviewStatusCounts,
    serviceCount: project.services.size,
    services: [...project.services].filter(Boolean).sort(),
    ownerKinds: ownerTags,
    visibility: visibilityTags,
    reviewStatuses: reviewTags,
    tags: uniqueStrings([progressTag, ...reviewTags, ...visibilityTags, ...ownerTags]),
    nextAction: firstAction(project.nextActions),
    sourceRefs: uniqueStrings([...project.sourceRefs].filter(Boolean)),
    reviewEvidence: uniqueStrings([...project.reviewEvidence].filter(Boolean)),
    onboardingEntries: project.onboardingEntries.sort(),
    ports: project.ports.sort(),
    publicRoutes: project.publicRoutes.sort(),
    localAgents: project.localAgents.sort(),
    startupRefs: project.startupRefs.sort(),
    serviceTargets: project.serviceTargets.sort()
  };
}

function aggregateProjectProgress(readinessCounts, controlReadinessCounts) {
  const values = [...readinessCounts.keys()];
  const fallbackValues = [...controlReadinessCounts.keys()];
  const source = values.length ? values : fallbackValues;
  if (!source.length) return "UNTRACKED";
  if (source.every((value) => value === "READY")) return "READY";
  if (source.some((value) => value === "READY" || value === "PARTIAL")) return "PARTIAL";
  if (source.some((value) => value === "BLOCKED")) return "BLOCKED";
  return "UNTRACKED";
}

function projectProgressPercent(readinessCounts, controlReadinessCounts) {
  const values = expandCountMap(readinessCounts);
  const fallbackValues = expandCountMap(controlReadinessCounts);
  const source = values.length ? values : fallbackValues;
  if (!source.length) return 0;
  const score = source.reduce((total, value) => total + progressValue(value), 0) / source.length;
  return Math.round(score);
}

function progressValue(value) {
  if (value === "READY") return 100;
  if (value === "PARTIAL") return 60;
  if (value === "BLOCKED") return 20;
  return 0;
}

function progressRank(value) {
  return new Map([
    ["BLOCKED", 0],
    ["PARTIAL", 1],
    ["UNTRACKED", 2],
    ["READY", 3]
  ]).get(value) ?? 9;
}

function firstAction(actions) {
  return actions.find((action) => typeof action === "string" && action.trim()) || "";
}

function increment(map, key) {
  const normalized = String(key || "unknown");
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sortedKeys(map) {
  return [...map.keys()].filter(Boolean).sort();
}

function expandCountMap(map) {
  return [...map.entries()].flatMap(([key, count]) => Array.from({ length: count }, () => key));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function webEntrypointProject(route) {
  const text = `${route.id} ${route.serviceId} ${route.hostname}`.toLowerCase();
  if (text.includes("tb2")) return "tb2";
  if (text.includes("devgov")) return "devgov";
  if (text.includes("codex-remote")) return "codex-remote";
  if (text.includes("codex-calendar-todo")) return "codex-calendar-todo";
  if (text.includes("taste")) return "taste";
  if (text.includes("lmstudio") || text.includes("lm-studio")) return "lm-studio";
  return route.serviceId;
}

function inferRouteStage(route) {
  const text = `${route.id} ${route.hostname} ${route.notes}`.toLowerCase();
  if (text.includes("staging")) return "staging";
  if (text.includes("prod")) return "prod";
  if (route.exposureClass === "public-health") return "public-health";
  if (route.exposureClass === "staging-private") return "staging";
  return route.exposureClass;
}

export function buildServiceTargets({ dashboardPort, publicRoutes = [], localAgents = [], startupEntries = [], onboardingEntries = [], ports = [], serviceControls = [] }) {
  const targets = [];
  const serviceControlPort = ports.find((entry) => entry.project === "devgov" && entry.service === "service-control-http");
  const startupById = new Map(startupEntries.map((entry) => [entry.id, entry]));
  const startupByProject = new Map(startupEntries.map((entry) => [entry.project, entry]));
  const startupByControlTarget = buildStartupByControlTarget(startupEntries);
  const portsByProjectService = new Map(ports.map((entry) => [`${entry.project}:${entry.service}`, entry]));
  const approvedControlsByTarget = buildApprovedControlsByTarget(serviceControls);

  if (dashboardPort) {
    const target = {
      id: "devgov-dashboard",
      controlTargetId: "devgov-dashboard",
      project: "devgov",
      label: "DevGov Dashboard",
      kind: "dashboard",
      registryStatus: "approved",
      url: `${dashboardPort.protocol}://${dashboardPort.host}:${dashboardPort.port}/health`,
      target: `${dashboardPort.host}:${dashboardPort.port}`,
      quickTest: buildQuickTest(`${dashboardPort.protocol}://${dashboardPort.host}:${dashboardPort.port}/health`),
      doctor: {
        state: "FOUND",
        ref: "package.json#scripts.doctor",
        notes: "DevGov Doctor is exposed through npm run doctor and /api/doctor."
      },
      restart: {
        state: "FOUND",
        ref: "scripts/open-dashboard.mjs",
        notes: "Reviewed on-demand starter exists. Dashboard execution remains disabled."
      }
    };
    targets.push(withControlReadiness(applyApprovedControlRefs(target, approvedControlsByTarget)));
  }

  if (serviceControlPort) {
    const healthUrl = `${serviceControlPort.protocol}://${serviceControlPort.host}:${serviceControlPort.port}/health`;
    const target = {
      id: "devgov-service-control",
      controlTargetId: "devgov-service-control",
      project: "devgov",
      label: "DevGov Service Control",
      kind: "dashboard",
      registryStatus: serviceControlPort.visibility,
      url: healthUrl,
      target: `${SERVICE_CONTROL_HOST}:${SERVICE_CONTROL_PORT}`,
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: "Use the reviewed DevGov service-control Doctor wrapper to validate the local-only listener and canonical registries."
      },
      restart: {
        state: "REVIEW_REQUIRED",
        ref: "scripts/open-dashboard.mjs",
        notes: "The control listener is started with the dashboard process, but self-restart from the control listener remains review-gated."
      }
    };
    targets.push(withControlReadiness(applyApprovedControlRefs(target, approvedControlsByTarget)));
  }

  for (const agent of localAgents) {
    const controlTargetId = deriveLocalAgentControlTargetId(agent);
    const startup = startupById.get(agent.startupRef)
      ?? startupByControlTarget.get(controlTargetId)
      ?? startupByProject.get(agent.project);
    const target = {
      id: `local-agent:${agent.id}`,
      controlTargetId,
      project: agent.project,
      label: agent.displayName,
      kind: "local-agent",
      registryStatus: agent.status,
      url: agent.healthUrl,
      target: agent.serviceId,
      quickTest: buildQuickTest(
        agent.healthUrl,
        agent.id === "local-archive-maintainer"
          ? {
              acceptedStatusCodes: [200, 401],
              notes: "Safe HTTP auth-boundary check only. 401 confirms the protected local health endpoint is alive."
            }
          : agent.id === "lmstudio-local-agent"
            ? {
                acceptedStatusCodes: [200, 401],
                notes: "Safe HTTP auth-boundary check only. 401 confirms the protected local model API is alive."
              }
          : {}
      ),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: "No stable project Doctor mechanism is registered for this local agent."
      },
      restart: isStartupExecutionSuppressed(startup, agent.status) ? {
        state: "DISABLED",
        ref: startup?.scriptRef || "",
        notes: "Execution is intentionally disabled for deprecated or policy-blocked targets."
      } : startup ? {
        state: "REVIEW_REQUIRED",
        ref: startup.scriptRef,
        notes: "A startup/service reference exists, but it is not approved for dashboard restart execution."
      } : {
        state: "MISSING",
        ref: "",
        notes: "No stable startup or restart reference is registered."
      }
    };
    targets.push(withControlReadiness(applyApprovedControlRefs(target, approvedControlsByTarget)));
  }

  for (const route of publicRoutes) {
    const controlTargetId = derivePublicRouteControlTargetId(route);
    const startup = startupByControlTarget.get(controlTargetId)
      ?? startupByProject.get(route.serviceId);
    const target = {
      id: `public-route:${route.id}`,
      controlTargetId,
      project: route.serviceId,
      label: route.hostname,
      kind: "public-route",
      registryStatus: route.status,
      url: route.healthUrl,
      target: `${route.localHost}:${route.localPort}`,
      quickTest: buildQuickTest(
        route.healthUrl,
        route.id === "lmstudio"
          ? {
              acceptedStatusCodes: [200, 401],
              notes: "Safe HTTP auth-boundary check only. 401 confirms the protected local model API route is alive."
            }
          : {}
      ),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: "Public-route health URL is a quick test, not a registered project Doctor."
      },
      restart: isStartupExecutionSuppressed(startup, route.status) ? {
        state: "DISABLED",
        ref: startup?.scriptRef || "",
        notes: "Execution is intentionally disabled for deprecated or policy-blocked targets."
      } : startup ? {
        state: "REVIEW_REQUIRED",
        ref: startup.scriptRef,
        notes: "Startup governance exists for this service, but dashboard restart execution is not approved."
      } : {
        state: "MISSING",
        ref: "",
        notes: "No stable startup or restart reference is registered for this public route."
      }
    };
    targets.push(withControlReadiness(applyApprovedControlRefs(target, approvedControlsByTarget)));
  }

  for (const target of buildOnboardingOnlyTargets({ onboardingEntries, startupById, startupByProject, portsByProjectService })) {
    targets.push(withControlReadiness(applyApprovedControlRefs(target, approvedControlsByTarget)));
  }

  return sortServiceTargetsForDashboard(targets);
}

export function buildWorkspaceGovernancePredictionModel(agentInstructions = {}) {
  const entries = Array.isArray(agentInstructions.entries) ? agentInstructions.entries : [];
  const layers = Array.isArray(agentInstructions.layers) ? agentInstructions.layers : [];
  const itemTypes = Array.isArray(agentInstructions.itemTypes) ? agentInstructions.itemTypes : [];

  return {
    schema: "devgov.workspace-governance-predictor.v1",
    defaultWorkspaceRoot: "Q:\\Projects",
    qDriveRoot: "Q:\\",
    devgovProjectId: "dev-governance-kit",
    layers: layers.map((layer) => ({
      id: layer.id,
      scope: layer.scope,
      precedence: layer.precedence,
      appliesTo: layer.appliesTo,
      source: layer.source,
      status: layer.status
    })),
    itemTypes: itemTypes.map((itemType) => ({
      id: itemType.id,
      label: itemType.label,
      description: itemType.description,
      status: itemType.status
    })),
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      layer: entry.layer,
      appliesTo: entry.appliesTo,
      requirement: entry.requirement,
      enforcement: entry.enforcement,
      evidence: entry.evidence,
      status: entry.status,
      source: entry.source
    })),
    rules: [
      {
        id: "workspace.location.q-projects",
        type: "safety-gate",
        layer: "workspace",
        requirement: "Project development should use the governed Q:\\Projects workspace by default.",
        enforcement: "Locations outside Q:\\ require operator direction before project work continues.",
        execution: [
          { label: "Path scope validation", command: "Normalize path and verify it is under Q:\\Projects, then verify Q:\\ and Q:\\Projects governance rules." , when: "Before predicting or editing." }
        ],
        evidence: "global AGENTS.md#Project Workspace Location",
        status: "approved"
      },
      {
        id: "workspace.git.pre-edit",
        type: "safety-gate",
        layer: "repo-local",
        requirement: "Detect the repository root, branch, and worktree state before editing.",
        enforcement: "Run git status --short --branch when Git is available and stop on unclear pre-existing dirty state.",
        execution: [
          { label: "Repository pre-flight", command: "git status --short --branch", when: "Before changing files." }
        ],
        evidence: "global AGENTS.md#Git and Workspace Safety",
        status: "approved"
      },
      {
        id: "workspace.repo-instruction-discovery",
        type: "workflow-control",
        layer: "repo-local",
        requirement: "After a workspace path is selected, inspect the nearest repo-local AGENTS.md before changing files.",
        enforcement: "Treat missing or unreadable repo-local instructions as unresolved, not invented.",
        execution: [
          { label: "Repo rule discovery", command: "Inspect AGENTS.md and any subtree overlays for the selected path before editing", when: "After repo root is confirmed." }
        ],
        evidence: "AGENTS.md#Instruction Scope And Precedence",
        status: "approved"
      },
      {
        id: "workspace.subtree-instruction-discovery",
        type: "workflow-control",
        layer: "subtree",
        requirement: "Folder-local AGENTS overlays may narrow behavior for the selected subtree.",
        enforcement: "Inspect relevant subtree instructions only after the selected path is inside the target repo.",
        execution: [
          { label: "Subtree discovery", command: "Inspect subtree AGENTS overlays only for the selected workspace path depth", when: "When the path is inside a repo-local tree." }
        ],
        evidence: "AGENTS.md#Instruction Scope And Precedence",
        status: "approved"
      },
      {
        id: "workspace.worktree-container",
        type: "workflow-control",
        layer: "workspace",
        requirement: "Worktree containers are operational storage, not standalone projects.",
        enforcement: "Scan worktrees read-only and require a separate review gate before cleanup.",
        execution: [
          { label: "Worktree container check", command: "Scan worktree container membership and refuse cleanup actions without an extra reviewed step", when: "Before any cleanup action." }
        ],
        evidence: "AGENTS.md#Worktree Governance Rules",
        status: "approved"
      },
      {
        id: "workspace.registry-redaction-boundary",
        type: "data-contract",
        layer: "repo-local",
        requirement: "Canonical registry records use stable IDs and must not store machine-local paths or secret values.",
        enforcement: "Keep selected-path evidence in generated reports or UI state, not canonical registry data.",
        execution: [
          { label: "Registry boundary check", command: "Keep local-only paths and raw command output in reports only; only stable fields in registry JSON", when: "Before persisting canonical records." }
        ],
        evidence: "AGENTS.md#Data Entry Contract",
        status: "approved"
      },
      {
        id: "workspace.scan-readonly-first",
        type: "tool-entry",
        layer: "repo-local",
        requirement: "Use the narrowest read-only scan before considering mutation.",
        enforcement: "Prefer DevGov scan commands for ports, worktrees, startup, public routes, and AGENTS indexing.",
        execution: [
          { label: "Read-only scan gate", command: "Run the scan command for the relevant scope before any write operation", when: "Whenever touching files, services, or startup settings." }
        ],
        evidence: "AGENTS.md#Execution Principles",
        status: "approved"
      }
    ],
    checks: [
      {
        id: "check.git-status",
        label: "Git safety",
        command: "git status --short --branch",
        when: "Before editing a selected repository",
        forRules: ["workspace.git.pre-edit"]
      },
      {
        id: "check.repo-instructions",
        label: "Repo instructions",
        command: "Inspect AGENTS.md and any narrower overlays",
        when: "After confirming the project root",
        forRules: ["workspace.repo-instruction-discovery"]
      },
      {
        id: "check.scan-project",
        label: "Port scan",
        command: "node scripts/scan-project.mjs <workspace> --out reports/<project>-port-audit.md",
        when: "When the selected project may bind local ports",
        forRules: ["workspace.scan-readonly-first"]
      },
      {
        id: "check.worktrees",
        label: "Worktree scan",
        command: "npm run scan:worktrees -- Q:\\Projects --out reports/worktree-audit.md",
        when: "When the selected path is a linked worktree or worktree container",
        forRules: ["workspace.worktree-container", "workspace.subtree-instruction-discovery"]
      }
    ]
  };
}

export async function checkServiceStatuses(root = ".", options = {}) {
  const state = await loadDashboardState(root);
  const timeoutMs = options.timeoutMs ?? 2500;
  const statuses = await Promise.all(state.serviceTargets.map(async (target) => {
    const live = target.quickTest?.probeRef
      ? await checkLocalProbe(root, target.quickTest, timeoutMs)
      : await checkUrl(target.url, timeoutMs, target.quickTest);
    const quickTest = {
      ...target.quickTest,
      ...live
    };
    return {
      ...target,
      live,
      quickTest,
      controlReadiness: deriveControlReadiness({
        ...target,
        live,
        quickTest
      }, { useLiveHealth: true })
    };
  }));
  const retiredServices = statuses.filter(isRetiredEvidenceTarget);
  const activeServices = statuses.filter((target) => !isRetiredEvidenceTarget(target));

  return {
    schema: "devgov.service-status.v1",
    generatedAt: new Date().toISOString(),
    timeoutMs,
    services: activeServices,
    retiredServices
  };
}

function buildQuickTest(url, options = {}) {
  return {
    state: url || options.probeRef ? "CHECKING" : "MISSING",
    url,
    notes: url || options.probeRef ? (options.notes || "Safe HTTP health check only.") : "No health URL is registered.",
    acceptedStatusCodes: Array.isArray(options.acceptedStatusCodes) ? options.acceptedStatusCodes : undefined,
    probeRef: options.probeRef || "",
    timeoutSeconds: Number.isInteger(options.timeoutSeconds) ? options.timeoutSeconds : undefined
  };
}

function withControlReadiness(target) {
  return {
    ...target,
    controlReadiness: deriveControlReadiness(target)
  };
}

function deriveControlReadiness(target, options = {}) {
  if (isControlSuppressedTarget(target)) {
    return "BLOCKED";
  }

  const quickState = target.quickTest?.state;
  const hasQuickSignal = options.useLiveHealth
    ? ["ONLINE", "OFFLINE", "ERROR"].includes(quickState)
    : Boolean(target.quickTest?.url || target.quickTest?.probeRef);
  const quickOnline = quickState === "ONLINE";

  if (quickOnline && target.doctor?.state === "FOUND" && target.restart?.state === "FOUND") {
    return "READY";
  }

  if (hasQuickSignal && [target.doctor?.state, target.restart?.state].some((state) => ["FOUND", "REVIEW_REQUIRED"].includes(state))) {
    return "PARTIAL";
  }

  return "BLOCKED";
}

function isControlSuppressedTarget(target) {
  return target.registryStatus === "deprecated" || target.restart?.state === "DISABLED";
}

function isRetiredEvidenceTarget(target) {
  return target.registryStatus === "deprecated";
}

function isStartupExecutionSuppressed(startup, status) {
  return status === "deprecated" || startup?.status === "deprecated";
}

function buildStartupByControlTarget(startupEntries = []) {
  const lookup = new Map();
  for (const entry of startupEntries) {
    for (const alias of deriveStartupControlTargetAliases(entry)) {
      if (!lookup.has(alias)) {
        lookup.set(alias, entry);
      }
    }
  }
  return lookup;
}

function deriveStartupControlTargetAliases(entry) {
  const aliases = new Set([entry.project, entry.id]);
  if (entry.project === "devgov") {
    if (entry.id.includes("dashboard") || /dashboard/i.test(entry.purpose) || /dashboard/i.test(entry.scriptRef)) {
      aliases.add("devgov-dashboard");
    }
  }
  if (entry.project === "codex-calendar-todo") {
    aliases.add("codex-calendar-todo-staging");
  }
  if (entry.project === "chatgpt-local-files-mcp") {
    aliases.add("mcp-colorgeek");
  }
  if (entry.project === "lm-studio") {
    aliases.add("lmstudio");
  }
  return aliases;
}

function deriveLocalAgentControlTargetId(agent) {
  return agent.id;
}

function derivePublicRouteControlTargetId(route) {
  const byId = route.id;
  if (byId === "devgov-gov" || byId === "devgov-dev") return "devgov-dashboard";
  if (byId === "codex-calendar-todo-staging") return "codex-calendar-todo-staging";
  if (byId === "codex-remote") return "codex-remote";
  if (byId === "mcp-colorgeek") return "mcp-colorgeek";
  if (byId === "taste") return "taste";
  if (byId === "lmstudio") return "lm-studio";
  if (byId.startsWith("tb2")) return "tb2";
  return route.serviceId;
}

function buildApprovedControlsByTarget(serviceControls = []) {
  const map = new Map();
  for (const entry of serviceControls) {
    if (!entry?.approved || entry?.status !== "approved") {
      continue;
    }
    const actions = map.get(entry.controlTargetId) ?? new Map();
    actions.set(entry.action, entry);
    map.set(entry.controlTargetId, actions);
  }
  return map;
}

function applyApprovedControlRefs(target, approvedControlsByTarget) {
  const actions = approvedControlsByTarget.get(target.controlTargetId);
  if (!actions) {
    return target;
  }

  const nextTarget = {
    ...target,
    doctor: { ...target.doctor },
    restart: { ...target.restart }
  };

  for (const action of ["doctor", "restart"]) {
    const approved = actions.get(action);
    if (!approved) {
      continue;
    }
    const current = nextTarget[action];
    if (action === "restart") {
      const readiness = restartPolicyReadiness(approved);
      nextTarget[action] = {
        ...current,
        state: readiness.complete ? "FOUND" : "REVIEW_REQUIRED",
        ref: approved.wrapperRef,
        notes: approved.notes || current?.notes || "",
        policyReadiness: readiness
      };
      continue;
    }
    nextTarget[action] = {
      ...current,
      state: "FOUND",
      ref: approved.wrapperRef,
      notes: approved.notes || current?.notes || ""
    };
  }

  return nextTarget;
}

function restartPolicyReadiness(controlEntry) {
  const policy = controlEntry?.restartPolicy ?? {};
  const missing = [
    { key: "permissionBoundary", value: policy.permissionBoundary },
    { key: "backupExpectation", value: policy.backupExpectation },
    { key: "rollbackExpectation", value: policy.rollbackExpectation }
  ].filter((item) => typeof item.value !== "string" || !item.value.trim());

  if (!missing.length) {
    return { complete: true, state: "READY", policyMessage: "Policy reviewed." };
  }
  return {
    complete: false,
    state: "INCOMPLETE",
    policyMessage: `Missing ${missing.map((item) => item.key).join(", ")}`
  };
}

function buildOnboardingOnlyTargets({ onboardingEntries = [], startupById, startupByProject, portsByProjectService }) {
  const targets = [];
  const tunnelClient = onboardingEntries.find((entry) => entry.id === "tunnel-client-local-filesystem-mcp");
  if (tunnelClient) {
    const startup = startupById.get("tunnel-client-local-filesystem-login")
      ?? startupByProject.get("openai-mcp-tunnel");
    const portEntry = portsByProjectService.get("openai-mcp-tunnel:local-filesystem-mcp-admin-http");
    targets.push({
      id: "onboarding:tunnel-client-local-filesystem-mcp",
      controlTargetId: "tunnel-client-local-filesystem-mcp",
      project: "openai-mcp-tunnel",
      label: "Tunnel Client Local Filesystem MCP",
      kind: "runtime-command",
      registryStatus: startup?.status || "candidate",
      url: "http://127.0.0.1:8080/readyz",
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:8080",
      quickTest: buildQuickTest("http://127.0.0.1:8080/readyz"),
      doctor: {
        state: "FOUND",
        ref: "scripts/service-control/doctor-tunnel-client-local-filesystem-mcp.ps1",
        notes: tunnelClient.doctorProcedure
      },
      restart: {
        state: "FOUND",
        ref: "scripts/service-control/restart-tunnel-client-local-filesystem-mcp.ps1",
        notes: tunnelClient.startupProcedure
      }
    });
  }
  const ps3eye = onboardingEntries.find((entry) => entry.id === "ps3eye-windows-virtual-camera-observation");
  if (ps3eye) {
    const startup = startupById.get("ps3eye-system-camera-login")
      ?? startupByProject.get("ps3eye-windows-virtual-camera");
    targets.push({
      id: "onboarding:ps3eye-windows-virtual-camera",
      controlTargetId: "ps3eye-windows-virtual-camera",
      project: "ps3eye-windows-virtual-camera",
      label: "PS3 Eye Virtual Camera",
      kind: "hardware-observation",
      registryStatus: startup?.status || "candidate",
      url: "",
      target: "camera-observation",
      quickTest: buildQuickTest("", {
        notes: "Safe local observation probe only. Confirms feeder, virtual camera process, fresh frame updates, and camera registration without exposing image contents.",
        probeRef: "scripts/service-control/quickcheck-ps3eye-windows-virtual-camera.ps1",
        timeoutSeconds: 30
      }),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: ps3eye.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: ps3eye.resetProcedure
      }
    });
  }
  const sbs = onboardingEntries.find((entry) => entry.id === "sbs-local-proxy-http");
  if (sbs) {
    const portEntry = portsByProjectService.get("sbs:local-proxy-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/health` : "http://127.0.0.1:3287/health";
    targets.push({
      id: "onboarding:sbs-local-proxy-http",
      controlTargetId: "sbs",
      project: "sbs",
      label: "SBS Local Proxy",
      kind: "runtime-command",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:3287",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: sbs.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: sbs.resetProcedure
      }
    });
  }
  const displayShaderLab = onboardingEntries.find((entry) => entry.id === "color-management-shader-display-shader-control-lab-http");
  if (displayShaderLab) {
    const portEntry = portsByProjectService.get("color-management-Shader:display-shader-control-lab-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/index.html` : "http://127.0.0.1:4173/index.html";
    targets.push({
      id: "onboarding:color-management-shader-display-shader-control-lab-http",
      controlTargetId: "color-management-shader",
      project: "color-management-Shader",
      label: "Display Shader Control Lab",
      kind: "preview-runtime",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:4173",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: displayShaderLab.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: displayShaderLab.resetProcedure
      }
    });
  }
  const nowledgeCompat = onboardingEntries.find((entry) => entry.id === "chatgpt-local-files-mcp-nowledge-compat-http");
  if (nowledgeCompat) {
    const portEntry = portsByProjectService.get("chatgpt-local-files-mcp:nowledge-compat-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/health` : "http://127.0.0.1:14242/health";
    targets.push({
      id: "onboarding:chatgpt-local-files-mcp-nowledge-compat-http",
      controlTargetId: "chatgpt-local-files-mcp-nowledge-compat",
      project: "chatgpt-local-files-mcp",
      label: "Nowledge Compat API",
      kind: "runtime-command",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:14242",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: nowledgeCompat.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: nowledgeCompat.resetProcedure
      }
    });
  }
  const urlHero = onboardingEntries.find((entry) => entry.id === "url-hero-vite-dev");
  if (urlHero) {
    const portEntry = portsByProjectService.get("url-hero:vite-dev");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/url-hero/` : "http://127.0.0.1:3100/url-hero/";
    targets.push({
      id: "onboarding:url-hero-vite-dev",
      controlTargetId: "url-hero",
      project: "url-hero",
      label: "URL Hero",
      kind: "vite-dev-runtime",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:3100",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: urlHero.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: urlHero.resetProcedure
      }
    });
  }
  const gsdfEotf = onboardingEntries.find((entry) => entry.id === "gsdf-eotf-video-adjuster-vite-dev");
  if (gsdfEotf) {
    const portEntry = portsByProjectService.get("gsdf-eotf-video-adjuster:vite-dev");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/` : "http://127.0.0.1:3101/";
    targets.push({
      id: "onboarding:gsdf-eotf-video-adjuster-vite-dev",
      controlTargetId: "gsdf-eotf-video-adjuster",
      project: "gsdf-eotf-video-adjuster",
      label: "LumaLift GSDF/EOTF Dev UI",
      kind: "vite-dev-runtime",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:3101",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: gsdfEotf.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: gsdfEotf.resetProcedure
      }
    });
  }
  const drawDraw = onboardingEntries.find((entry) => entry.id === "draw-draw-web-http");
  if (drawDraw) {
    const portEntry = portsByProjectService.get("draw-draw:web-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/` : "http://127.0.0.1:31700/";
    targets.push({
      id: "onboarding:draw-draw-web-http",
      controlTargetId: "draw-draw",
      project: "draw-draw",
      label: "draw-draw UI Review Canvas",
      kind: "vite-dev-runtime",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:31700",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: drawDraw.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: drawDraw.resetProcedure
      }
    });
  }
  const skill0Gui = onboardingEntries.find((entry) => entry.id === "skill-0-gui-review-studio-http");
  if (skill0Gui) {
    const portEntry = portsByProjectService.get("skill-0-GUI:review-studio-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/healthz` : "http://127.0.0.1:3102/healthz";
    targets.push({
      id: "onboarding:skill-0-gui-review-studio-http",
      controlTargetId: "skill-0-gui",
      project: "skill-0-GUI",
      label: "Skill-0 Review Studio",
      kind: "local-web-ui",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:3102",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: skill0Gui.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: skill0Gui.resetProcedure
      }
    });
  }
  const comfyui = onboardingEntries.find((entry) => entry.id === "comfyui-local-http");
  if (comfyui) {
    const portEntry = portsByProjectService.get("ComfyUI:comfyui-local-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/system_stats` : "http://127.0.0.1:8188/system_stats";
    targets.push({
      id: "onboarding:comfyui-local-http",
      controlTargetId: "comfyui-local",
      project: "ComfyUI",
      label: "ComfyUI",
      kind: "portable-runtime",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:8188",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: comfyui.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: comfyui.resetProcedure
      }
    });
  }
  const photoHdrFlow = onboardingEntries.find((entry) => entry.id === "photo-hdr-flow-web-ui-http");
  if (photoHdrFlow) {
    const portEntry = portsByProjectService.get("photo-hdr-flow:web-ui-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/api/health` : "http://127.0.0.1:8765/api/health";
    targets.push({
      id: "onboarding:photo-hdr-flow-web-ui-http",
      controlTargetId: "photo-hdr-flow-web",
      project: "photo-hdr-flow",
      label: "Photo HDR Flow",
      kind: "local-web-ui",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:8765",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: photoHdrFlow.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: photoHdrFlow.resetProcedure
      }
    });
  }
  const videoRenderKit = onboardingEntries.find((entry) => entry.id === "video-render-kit-control-panel-http");
  if (videoRenderKit) {
    const portEntry = portsByProjectService.get("video-render-kit:control-panel-http");
    const healthUrl = portEntry ? `${portEntry.protocol}://${portEntry.host}:${portEntry.port}/api/state` : "http://127.0.0.1:5001/api/state";
    targets.push({
      id: "onboarding:video-render-kit-control-panel-http",
      controlTargetId: "video-render-kit-web",
      project: "video-render-kit",
      label: "FFmpeg 轉檔控制台",
      kind: "local-web-ui",
      registryStatus: "candidate",
      url: healthUrl,
      target: portEntry ? `${portEntry.host}:${portEntry.port}` : "127.0.0.1:5001",
      quickTest: buildQuickTest(healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: videoRenderKit.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: videoRenderKit.resetProcedure
      }
    });
  }
  const chromeAiModelStore = onboardingEntries.find((entry) => entry.id === "chrome-ai-model-store-filesystem");
  if (chromeAiModelStore) {
    targets.push({
      id: "onboarding:chrome-ai-model-store-filesystem",
      controlTargetId: "chrome-ai-model-store",
      project: "chrome-ai-model-store",
      label: "Chrome AI Model Store",
      kind: "runtime-command",
      registryStatus: "approved",
      url: "",
      target: "filesystem-model-cache",
      quickTest: buildQuickTest("", {
        notes: "Safe local filesystem probe only. Confirms the Stable primary model store and linked Chrome channel model directories.",
        probeRef: "scripts/service-control/quickcheck-chrome-ai-model-store.ps1",
        timeoutSeconds: 45
      }),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: chromeAiModelStore.doctorProcedure
      },
      restart: {
        state: "MISSING",
        ref: "",
        notes: chromeAiModelStore.resetProcedure
      }
    });
  }
  return targets;
}

export function buildUniTextAgentInstructionIndex(agentInstructions) {
  const sourcePath = "registry/agent-instructions.registry.json";
  const nodes = [
    ...agentInstructions.layers.map((layer) => ({
      id: `layer:${layer.id}`,
      type: "agent-instruction-layer",
      label: layer.id,
      path: sourcePath,
      summary: layer.appliesTo,
      status: layer.status,
      searchText: [layer.id, layer.scope, layer.appliesTo, layer.notes].join(" ")
    })),
    ...agentInstructions.itemTypes.map((itemType) => ({
      id: `item-type:${itemType.id}`,
      type: "agent-instruction-item-type",
      label: itemType.label,
      path: sourcePath,
      summary: itemType.description,
      status: itemType.status,
      searchText: [itemType.id, itemType.label, itemType.description, itemType.governanceUse].join(" ")
    })),
    ...agentInstructions.entries.map((entry) => ({
      id: `instruction:${entry.id}`,
      type: "agent-instruction",
      label: entry.id,
      path: sourcePath,
      logicalPath: entry.evidence,
      summary: entry.requirement,
      status: entry.status,
      searchText: [
        entry.id,
        entry.type,
        entry.layer,
        entry.appliesTo,
        entry.requirement,
        entry.enforcement,
        entry.evidence,
        entry.notes
      ].join(" ")
    }))
  ];

  return {
    schema: "devgov.unitext-agent-instructions.v1",
    generatedAt: new Date().toISOString(),
    adapter: {
      id: "governance-folder",
      sourceOfTruth: agentInstructions.sourceOfTruth,
      canonicalRegistry: sourcePath,
      queryUse: "Ingest as a UniText-style governance-folder read model without copying local-only evidence."
    },
    nodes,
    edges: agentInstructions.entries.flatMap((entry) => [
      { from: `layer:${entry.layer}`, to: `instruction:${entry.id}`, kind: "governs" },
      { from: `item-type:${entry.type}`, to: `instruction:${entry.id}`, kind: "classifies" }
    ]),
    queryFields: ["id", "type", "label", "path", "logicalPath", "summary", "status", "searchText"]
  };
}

export function renderDashboardHtml(state) {
  const stateJson = JSON.stringify(state).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DevGov Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --ink: oklch(23% 0.018 248);
      --muted: oklch(47% 0.035 248);
      --line: oklch(82% 0.027 240);
      --paper: oklch(96% 0.01 86);
      --panel: oklch(99% 0.007 86);
      --panel-raised: oklch(94% 0.015 145);
      --input: oklch(99% 0.007 86);
      --accent: oklch(47% 0.106 183);
      --accent-ink: oklch(99% 0.007 86);
      --blue: oklch(45% 0.13 261);
      --green: oklch(42% 0.12 155);
      --ok-bg: oklch(90% 0.067 170);
      --wan-bg: oklch(91% 0.08 86);
      --bad-bg: oklch(90% 0.07 27);
      --neutral-bg: oklch(92% 0.021 248);
      --grid-line: oklch(23% 0.018 248 / .045);
      --header-bg: oklch(99% 0.007 86 / .94);
      --focus: oklch(58% 0.13 183);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --ink: oklch(92% 0.012 248);
        --muted: oklch(72% 0.03 248);
        --line: oklch(37% 0.03 248);
        --paper: oklch(18% 0.018 248);
        --panel: oklch(22% 0.02 248);
        --panel-raised: oklch(28% 0.035 178);
        --input: oklch(18% 0.018 248);
        --accent: oklch(70% 0.116 176);
        --accent-ink: oklch(16% 0.018 248);
        --blue: oklch(76% 0.102 253);
        --green: oklch(78% 0.112 155);
        --ok-bg: oklch(34% 0.063 170);
        --wan-bg: oklch(36% 0.064 86);
        --bad-bg: oklch(35% 0.064 27);
        --neutral-bg: oklch(30% 0.025 248);
        --grid-line: oklch(92% 0.012 248 / .045);
        --header-bg: oklch(20% 0.018 248 / .94);
        --focus: oklch(77% 0.13 176);
      }
    }
    [data-theme="light"] {
      color-scheme: light;
      --ink: oklch(23% 0.018 248);
      --muted: oklch(47% 0.035 248);
      --line: oklch(82% 0.027 240);
      --paper: oklch(96% 0.01 86);
      --panel: oklch(99% 0.007 86);
      --panel-raised: oklch(94% 0.015 145);
      --input: oklch(99% 0.007 86);
      --accent: oklch(47% 0.106 183);
      --accent-ink: oklch(99% 0.007 86);
      --blue: oklch(45% 0.13 261);
      --green: oklch(42% 0.12 155);
      --ok-bg: oklch(90% 0.067 170);
      --wan-bg: oklch(91% 0.08 86);
      --bad-bg: oklch(90% 0.07 27);
      --neutral-bg: oklch(92% 0.021 248);
      --grid-line: oklch(23% 0.018 248 / .045);
      --header-bg: oklch(99% 0.007 86 / .94);
      --focus: oklch(58% 0.13 183);
    }
    [data-theme="dark"] {
      color-scheme: dark;
      --ink: oklch(92% 0.012 248);
      --muted: oklch(72% 0.03 248);
      --line: oklch(37% 0.03 248);
      --paper: oklch(18% 0.018 248);
      --panel: oklch(22% 0.02 248);
      --panel-raised: oklch(28% 0.035 178);
      --input: oklch(18% 0.018 248);
      --accent: oklch(70% 0.116 176);
      --accent-ink: oklch(16% 0.018 248);
      --blue: oklch(76% 0.102 253);
      --green: oklch(78% 0.112 155);
      --ok-bg: oklch(34% 0.063 170);
      --wan-bg: oklch(36% 0.064 86);
      --bad-bg: oklch(35% 0.064 27);
      --neutral-bg: oklch(30% 0.025 248);
      --grid-line: oklch(92% 0.012 248 / .045);
      --header-bg: oklch(20% 0.018 248 / .94);
      --focus: oklch(77% 0.13 176);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
        linear-gradient(0deg, var(--grid-line) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font-family: "Aptos", "Segoe UI", system-ui, sans-serif;
    }
    header {
      border-bottom: 2px solid var(--ink);
      background: var(--header-bg);
      padding: 18px clamp(16px, 3vw, 34px);
      position: sticky;
      top: 0;
      z-index: 2;
      backdrop-filter: saturate(1.15) blur(8px);
    }
    .mast {
      align-items: end;
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr) auto;
      max-width: 1360px;
      margin: 0 auto;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(34px, 6vw, 72px);
      letter-spacing: 0;
      line-height: .9;
      margin: 0;
    }
    .header-actions {
      align-items: end;
      display: grid;
      gap: 10px;
      justify-items: end;
      min-width: 230px;
    }
    .status {
      align-items: center;
      display: flex;
      gap: 10px;
      font-size: 14px;
      justify-content: end;
      max-width: 34ch;
      overflow-wrap: anywhere;
    }
    .status-lamp {
      align-items: center;
      display: inline-flex;
      height: 22px;
      justify-content: center;
      position: relative;
      width: 22px;
    }
    .status-lamp::before {
      background: color-mix(in oklab, var(--accent) 72%, white 28%);
      border: 2px solid var(--ink);
      border-radius: 999px;
      box-shadow:
        0 0 0 1px color-mix(in oklab, var(--accent) 26%, transparent),
        0 0 12px color-mix(in oklab, var(--accent) 58%, transparent),
        0 0 22px color-mix(in oklab, var(--accent) 42%, transparent);
      content: "";
      height: 16px;
      left: 50%;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 16px;
    }
    .status-lamp-core {
      background: color-mix(in oklab, white 78%, var(--accent) 22%);
      border-radius: 999px;
      box-shadow:
        0 0 8px color-mix(in oklab, var(--accent) 68%, transparent),
        0 0 0 1px color-mix(in oklab, white 46%, transparent);
      height: 6px;
      left: 50%;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
    }
    .header-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .theme-toggle, .language-toggle {
      border: 2px solid var(--ink);
      background: var(--panel);
      justify-content: center;
      min-height: 38px;
      padding: 7px 12px;
      width: auto;
    }
    .theme-toggle:hover, .language-toggle:hover, .action-button:hover, nav button:hover {
      background: var(--panel-raised);
    }
    .theme-toggle:focus-visible, .language-toggle:focus-visible, button:focus-visible, input:focus-visible, a:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    main {
      display: grid;
      gap: 22px;
      grid-template-columns: 290px minmax(0, 1fr);
      max-width: 1360px;
      margin: 0 auto;
      padding: 24px clamp(16px, 3vw, 34px) 42px;
    }
    body.deck-mode main {
      display: block;
      max-width: 1520px;
      min-height: calc(100vh - 114px);
    }
    body.deck-mode nav {
      display: none;
    }
    body.deck-mode main > div {
      min-height: calc(100vh - 180px);
    }
    nav {
      align-self: start;
      border: 2px solid var(--ink);
      background: var(--panel);
      position: sticky;
      top: 116px;
    }
    button {
      align-items: center;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      color: var(--ink);
      cursor: pointer;
      display: flex;
      font: inherit;
      gap: 10px;
      min-height: 44px;
      padding: 10px 14px;
      text-align: left;
      transform-origin: left center;
      width: 100%;
    }
    button[aria-selected="true"] {
      background: var(--ink);
      color: var(--paper);
    }
    .action-button {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 38px;
      padding: 7px 12px;
      width: auto;
    }
    .action-button[disabled] {
      color: var(--muted);
      cursor: not-allowed;
      opacity: .7;
    }
    .glyph {
      border: 1px solid currentColor;
      display: inline-grid;
      font-size: 12px;
      height: 22px;
      place-items: center;
      transform-origin: center;
      width: 22px;
    }
    section { display: none; transform-origin: top center; }
    section.active { display: block; }
    section.table-view.active {
      align-content: start;
      display: grid;
      gap: 12px;
    }
    .strip {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(7, minmax(120px, 1fr));
      margin-bottom: 18px;
    }
    body.deck-mode .strip {
      --deck-edge: clamp(8px, 1.5vw, 18px);
      align-content: start;
      cursor: pointer;
      display: block;
      gap: clamp(14px, 2vw, 24px);
      margin: 0;
      min-height: calc(100svh - 190px);
      overflow: hidden;
      padding: var(--deck-edge);
      position: relative;
    }
    .metric {
      border: 2px solid var(--ink);
      background: var(--panel);
      color: var(--ink);
      display: block;
      min-height: 96px;
      padding: 12px;
      text-align: left;
      transform-origin: center bottom;
    }
    body.deck-mode .metric {
      --card-rotate: 0deg;
      --card-shadow-x: 8px;
      --card-shadow-y: 12px;
      --card-shadow-blur: 0;
      --card-shadow-alpha: .22;
      --card-x: 0px;
      --card-y: 0px;
      --card-lift: 0px;
      box-shadow: var(--card-shadow-x) var(--card-shadow-y) var(--card-shadow-blur) oklch(23% 0.018 248 / var(--card-shadow-alpha));
      cursor: grab;
      min-height: clamp(178px, 17vw, 244px);
      padding: clamp(18px, 2.4vw, 28px);
      position: absolute;
      touch-action: none;
      transform: translate(var(--card-x), calc(var(--card-y) + var(--card-lift))) rotate(var(--card-rotate));
      user-select: none;
      width: clamp(210px, 22vw, 310px);
    }
    body.deck-mode .metric::after {
      bottom: 14px;
      color: var(--muted);
      content: attr(data-action-label);
      font-size: 12px;
      font-weight: 700;
      left: clamp(18px, 2.4vw, 28px);
      position: absolute;
      text-transform: uppercase;
    }
    body.deck-mode .metric.is-dragging {
      cursor: grabbing;
      transition: none;
      z-index: 20;
    }
    body.deck-mode .metric.is-pressing {
      --card-lift: 3px;
      --card-shadow-x: 4px;
      --card-shadow-y: 5px;
      --card-shadow-alpha: .18;
    }
    .metric strong {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 36px;
      font-weight: 700;
      line-height: 1;
    }
    body.deck-mode .metric strong {
      font-size: clamp(54px, 7vw, 96px);
      line-height: .88;
    }
    .metric span, .muted {
      color: var(--muted);
      font-size: 13px;
    }
    body.deck-mode .metric span {
      display: block;
      font-size: clamp(18px, 2vw, 26px);
      margin-top: 10px;
    }
    body.deck-mode #dashboard-port {
      display: none;
    }
    .toolbar {
      align-items: center;
      display: flex;
      gap: 10px;
      justify-content: space-between;
      margin: 0;
    }
    .toolbar h2 {
      line-height: 1.2;
      margin: 0;
    }
    input {
      border: 2px solid var(--ink);
      background: var(--input);
      color: var(--ink);
      font: inherit;
      max-width: 420px;
      min-height: 42px;
      padding: 8px 10px;
      width: 100%;
    }
    a {
      color: var(--blue);
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    .guidance {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
      padding: 12px;
    }
    .guidance-row {
      display: grid;
      gap: 8px;
      grid-template-columns: 180px minmax(0, 1fr);
    }
    .predictor-actions {
      align-items: center;
      flex: 1;
      justify-content: flex-end;
      min-width: min(100%, 520px);
    }
    .predictor-actions input {
      max-width: min(100%, 520px);
    }
    .prediction-layout {
      display: grid;
      gap: 12px;
    }
    .prediction-summary {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr;
      padding: 12px;
    }
    .prediction-headline {
      display: grid;
      gap: 6px;
    }
    .prediction-headline strong {
      font-size: clamp(22px, 3vw, 34px);
      line-height: 1;
    }
    .prediction-facts {
      display: grid;
      gap: 6px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .prediction-facts .guidance-row {
      grid-template-columns: 140px minmax(0, 1fr);
    }
    .prediction-facts span {
      overflow-wrap: anywhere;
    }
    .prediction-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .prediction-tabs button {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 38px;
      padding: 7px 12px;
      width: auto;
    }
    .prediction-tabs button[aria-selected="true"] {
      background: var(--ink);
      color: var(--paper);
    }
    .prediction-panel {
      display: grid;
      gap: 12px;
    }
    .prediction-cards {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .prediction-card {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: 6px;
      padding: 12px;
    }
    .prediction-card h3 {
      font-size: 16px;
      line-height: 1.2;
      margin: 0;
    }
    .prediction-rule-summary {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: 10px;
      padding: 12px;
    }
    .prediction-rule-summary p {
      margin: 0;
      opacity: 0.8;
    }
    .prediction-rule-layer {
      border: 2px solid var(--ink);
      display: grid;
      gap: 8px;
      padding: 10px;
      background: var(--panel);
    }
    .prediction-rule-layer h4 {
      margin: 0;
    }
    .prediction-rule-group {
      background: var(--paper);
      border: 2px solid var(--ink);
      padding: 8px;
    }
    .prediction-rule-group + .prediction-rule-group,
    .prediction-rule-group + .prediction-rule-layer,
    .prediction-rule-layer + .prediction-rule-layer {
      margin-top: 8px;
    }
    .prediction-rule-group summary {
      cursor: pointer;
      font-weight: 700;
      list-style: none;
    }
    .prediction-rule-group summary::-webkit-details-marker {
      display: none;
    }
    .prediction-rule-group summary span {
      color: var(--muted);
      font-size: 0.95em;
      margin-left: 8px;
    }
    .prediction-rule-group table {
      margin-top: 8px;
    }
    .prediction-rule-exec-list {
      margin: 0;
      padding-left: 20px;
      display: grid;
      gap: 6px;
    }
    .prediction-rule-exec-item {
      margin: 0;
      padding: 0;
    }
    .prediction-rule-exec-list li {
      margin: 0;
      line-height: 1.35;
    }
    .prediction-rule-exec-list code {
      white-space: pre-wrap;
      word-break: break-word;
    }
    table[data-table="service-status"] {
      table-layout: fixed;
    }
    table[data-table="service-status"] th:nth-child(1) { width: 24%; }
    table[data-table="service-status"] th:nth-child(3) { width: 28%; }
    table[data-table="service-status"] th:nth-child(4) { width: 19%; }
    table[data-table="service-status"] td {
      overflow-wrap: normal;
    }
    table[data-table="registered-projects"] {
      table-layout: fixed;
    }
    table[data-table="registered-projects"] th:nth-child(1) { width: 18%; }
    table[data-table="registered-projects"] th:nth-child(2) { width: 18%; }
    table[data-table="registered-projects"] th:nth-child(5) { width: 24%; }
    .project-progress-cell, .project-services-cell, .next-action-cell, .source-link-list {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .progress-track {
      background: var(--neutral-bg);
      border: 1px solid var(--ink);
      height: 10px;
      overflow: hidden;
      width: 100%;
    }
    .progress-bar {
      background: var(--accent);
      height: 100%;
      min-width: 2px;
    }
    .tag-list {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .project-services-cell span, .next-action-cell span {
      overflow-wrap: anywhere;
    }
    .service-cell, .endpoint-cell, .last-check-cell {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .service-badges {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .service-name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .endpoint-cell a {
      display: block;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .last-check-cell {
      overflow-wrap: anywhere;
    }
    .check-grid {
      display: grid;
      gap: 6px;
      min-width: 220px;
    }
    .check-row {
      align-items: center;
      display: grid;
      gap: 4px 8px;
      grid-template-columns: 84px max-content minmax(0, 1fr);
      min-height: 26px;
    }
    .check-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.6;
      text-transform: uppercase;
    }
    .check-status {
      align-items: center;
      display: inline-flex;
      min-width: 0;
    }
    .check-detail {
      min-width: 0;
    }
    table {
      background: var(--panel);
      border: 2px solid var(--ink);
      border-collapse: collapse;
      transform-origin: top center;
      width: 100%;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--panel-raised);
      font-size: 12px;
      text-transform: uppercase;
    }
    td {
      overflow-wrap: anywhere;
    }
    code {
      color: var(--blue);
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 13px;
    }
    .file-ref-stack {
      align-items: flex-start;
      display: inline-flex;
      flex-direction: column;
      gap: 4px;
    }
    .file-ref-companion code {
      color: var(--green);
    }
    .pill {
      border: 1px solid var(--ink);
      display: inline-block;
      font-size: 12px;
      line-height: 1.35;
      padding: 2px 7px;
      transform-origin: center;
      white-space: nowrap;
    }
    .status-action {
      align-items: center;
      border: 1px solid var(--ink);
      color: var(--ink);
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      gap: 4px;
      justify-content: center;
      line-height: 1.35;
      min-height: 24px;
      padding: 2px 7px;
      text-align: center;
      transform-origin: center;
      white-space: nowrap;
      width: auto;
    }
    .status-action:hover {
      box-shadow: inset 0 0 0 999px color-mix(in oklab, white 16%, transparent);
    }
    .status-action[disabled] {
      color: var(--muted);
      cursor: not-allowed;
      opacity: .72;
    }
    .action-key {
      font-size: 13px;
      line-height: 1;
    }
    .inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .control-modal[hidden] {
      display: none;
    }
    .control-modal {
      align-items: center;
      background: oklch(18% 0.018 248 / .62);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: clamp(14px, 4vw, 34px);
      position: fixed;
      z-index: 20;
    }
    .control-modal-panel {
      background: var(--panel);
      border: 2px solid var(--ink);
      box-shadow: 12px 16px 0 oklch(23% 0.018 248 / .24);
      display: grid;
      gap: 12px;
      max-height: min(78vh, 720px);
      max-width: 760px;
      padding: 16px;
      width: min(100%, 760px);
    }
    .control-modal-header {
      align-items: start;
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .control-modal-header h3 {
      font-size: clamp(22px, 3vw, 34px);
      line-height: 1;
      margin: 0;
    }
    .control-modal-header button {
      border: 2px solid var(--ink);
      min-height: 34px;
      padding: 4px 10px;
      width: auto;
    }
    .control-modal-status {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .control-log {
      background: var(--paper);
      border: 2px solid var(--ink);
      color: var(--ink);
      font: 13px/1.45 "Cascadia Mono", Consolas, monospace;
      margin: 0;
      max-height: 310px;
      min-height: 168px;
      overflow: auto;
      padding: 12px;
      white-space: pre-wrap;
    }
    .control-modal-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
    .control-modal-actions button {
      border: 2px solid var(--ink);
      min-height: 38px;
      padding: 7px 12px;
      width: auto;
    }
    .control-modal-actions button[hidden] {
      display: none;
    }
    body.modal-open {
      overflow: hidden;
    }
    @media (prefers-reduced-motion: no-preference) {
      .status-lamp {
        animation: status-pulse 2.8s ease-in-out infinite;
      }
      button, .metric, .pill, tr {
        will-change: transform, opacity;
      }
      nav button:hover .glyph {
        transform: translateX(2px);
      }
      nav button .glyph {
        transition: transform 160ms ease-out;
      }
      .theme-toggle, .language-toggle, .action-button, .status-action, nav button {
        transition: background-color 160ms ease-out, box-shadow 160ms ease-out, color 160ms ease-out, transform 160ms ease-out;
      }
      .theme-toggle:active, .language-toggle:active, .action-button:active, .status-action:active, nav button:active {
        transform: translateY(1px);
      }
      body.deck-mode .metric {
        transition: box-shadow 140ms ease-out;
      }
    }
    @keyframes status-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.28); }
    }
    a.pill-link {
      color: var(--ink);
      font-family: inherit;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
    }
    .local { background: var(--ok-bg); }
    .public, .candidate { background: var(--wan-bg); }
    .blocked { background: var(--bad-bg); }
    .approved { background: var(--ok-bg); }
    .ONLINE { background: var(--ok-bg); }
    .OFFLINE { background: var(--bad-bg); }
    .ERROR { background: var(--wan-bg); }
    .CHECKING { background: var(--neutral-bg); }
    .online, .found, .ready { background: var(--ok-bg); }
    .offline, .missing, .blocked { background: var(--bad-bg); }
    .error, .review_required, .partial { background: var(--wan-bg); }
    .checking, .disabled, .not_applicable { background: var(--neutral-bg); }
    .inline-meta {
      color: var(--muted);
      display: block;
      font-size: 12px;
      margin-top: 2px;
    }
    @media (max-width: 820px) {
      .mast, main { grid-template-columns: 1fr; }
      .header-actions { justify-items: start; min-width: 0; }
      .header-buttons { justify-content: flex-start; }
      nav { position: static; }
      .strip { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      body.deck-mode main {
        min-height: calc(100svh - 150px);
        padding-inline: clamp(10px, 3vw, 18px);
      }
      body.deck-mode main > div {
        min-height: calc(100svh - 210px);
      }
      body.deck-mode .strip {
        --deck-edge: clamp(6px, 2vw, 12px);
        min-height: max(430px, calc(100svh - 230px));
      }
      body.deck-mode .metric {
        min-height: clamp(138px, 25vw, 176px);
        padding: clamp(14px, 3.5vw, 20px);
        width: clamp(166px, 33vw, 236px);
      }
      body.deck-mode .metric strong {
        font-size: clamp(42px, 9vw, 62px);
      }
      body.deck-mode .metric span {
        font-size: clamp(15px, 3.4vw, 20px);
        margin-top: 8px;
      }
      body.deck-mode .metric::after {
        bottom: 10px;
        left: clamp(14px, 3.5vw, 20px);
      }
      .status { justify-content: start; }
      .toolbar { align-items: stretch; flex-direction: column; }
      .guidance-row { grid-template-columns: 1fr; }
      .prediction-facts { grid-template-columns: 1fr; }
      .prediction-facts .guidance-row { grid-template-columns: 1fr; }
      .predictor-actions { justify-content: flex-start; min-width: 0; }
      table {
        display: block;
        font-size: 14px;
        overflow-x: auto;
        white-space: nowrap;
      }
      th, td { white-space: normal; }
    }
    @media (max-width: 520px) {
      body.deck-mode main {
        min-height: calc(100svh - 170px);
        padding: 10px 8px 28px;
      }
      body.deck-mode main > div {
        min-height: calc(100svh - 220px);
      }
      body.deck-mode .strip {
        --deck-edge: 6px;
        min-height: max(410px, calc(100svh - 238px));
      }
      body.deck-mode .metric {
        min-height: clamp(118px, 34vw, 148px);
        padding: 12px;
        width: clamp(132px, 42vw, 176px);
      }
      body.deck-mode .metric strong {
        font-size: clamp(34px, 11vw, 48px);
      }
      body.deck-mode .metric span {
        font-size: clamp(13px, 3.9vw, 16px);
        line-height: 1.15;
        margin-top: 6px;
      }
      body.deck-mode .metric::after {
        bottom: 8px;
        font-size: 11px;
        left: 12px;
      }
    }
  </style>
</head>
<body>
<header>
  <div class="mast">
    <div>
      <h1>DevGov</h1>
      <div class="muted" data-i18n="subtitle">本機治理主控台：集中檢查 ports、startup automation、public routes 與 workspace readiness。</div>
    </div>
    <div class="header-actions">
      <div class="header-buttons">
        <button class="language-toggle" type="button" id="language-toggle" aria-pressed="true">English</button>
        <button class="theme-toggle" type="button" id="theme-toggle" aria-pressed="false">深色模式</button>
      </div>
      <div class="status"><span class="status-lamp" aria-hidden="true"><span class="status-lamp-core"></span></span><span>${escapeHtml(state.app.url)}</span></div>
    </div>
  </div>
</header>
<main>
  <nav aria-label="儀表板檢視">
    <button data-view="overview" aria-selected="true"><span class="glyph">01</span> <span data-i18n="nav.overview">總覽</span></button>
    <button data-view="ports"><span class="glyph">02</span> <span data-i18n="nav.ports">Ports</span></button>
    <button data-view="registered-projects"><span class="glyph">03</span> <span data-i18n="nav.registeredProjects">本機登記專案</span></button>
    <button data-view="agents"><span class="glyph">04</span> <span data-i18n="nav.agents">本機 Agents</span></button>
    <button data-view="startup"><span class="glyph">05</span> <span data-i18n="nav.startup">啟動治理</span></button>
    <button data-view="routes"><span class="glyph">06</span> <span data-i18n="nav.routes">公開路由</span></button>
    <button data-view="terminal"><span class="glyph">07</span> <span data-i18n="nav.terminal">Terminal Profiles</span></button>
    <button data-view="api-keys"><span class="glyph">08</span> <span data-i18n="nav.apiKeys">API Key 治理</span></button>
    <button data-view="agent-instructions"><span class="glyph">09</span> <span data-i18n="nav.agentInstructions">Agent Instructions</span></button>
    <button data-view="workspace-predictor"><span class="glyph">10</span> <span data-i18n="nav.workspacePredictor">工作區預測</span></button>
    <button data-view="web-entrypoints"><span class="glyph">11</span> <span data-i18n="nav.webEntrypoints">Web 入口</span></button>
    <button data-view="service-status"><span class="glyph">12</span> <span data-i18n="nav.serviceStatus">服務狀態</span></button>
    <button data-view="service-onboarding"><span class="glyph">13</span> <span data-i18n="nav.serviceOnboarding">補充程序</span></button>
    <button data-view="web-console-events"><span class="glyph">14</span> <span data-i18n="nav.webConsoleEvents">Web Console Events</span></button>
  </nav>
  <div>
    <section id="overview" class="active">
      <div class="strip" id="metrics"></div>
      <table id="dashboard-port"></table>
    </section>
    <section id="ports" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.ports">Port Registry</h2><input data-filter="ports" placeholder="篩選 ports"></div>
      <table data-table="ports"></table>
    </section>
    <section id="registered-projects" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.registeredProjects">本機登記專案</h2><input data-filter="registered-projects" placeholder="篩選本機登記專案"></div>
      <div class="guidance">
        <div><strong data-i18n="registeredProjects.label">Progress tags:</strong> <span data-i18n="registeredProjects.body">Project progress is aggregated from existing DevGov registry fields: readiness, review status, visibility, service coverage, and next action.</span></div>
      </div>
      <table data-table="registered-projects"></table>
    </section>
    <section id="agents" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.agents">本機服務 Agents</h2><input data-filter="agents" placeholder="篩選本機 agents"></div>
      <table data-table="agents"></table>
    </section>
    <section id="startup" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.startup">啟動治理</h2><input data-filter="startup" placeholder="篩選啟動項目"></div>
      <table data-table="startup"></table>
    </section>
    <section id="routes" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.routes">公開路由</h2><input data-filter="routes" placeholder="篩選公開路由"></div>
      <table data-table="routes"></table>
    </section>
    <section id="terminal" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.terminal">Terminal Profiles</h2><input data-filter="terminal" placeholder="篩選 terminal"></div>
      <table data-table="terminal"></table>
    </section>
    <section id="api-keys" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.apiKeys">API Key 治理</h2><input data-filter="api-keys" placeholder="篩選 API keys"></div>
      <table data-table="api-keys"></table>
    </section>
    <section id="agent-instructions" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.agentInstructions">Agent Instructions</h2><input data-filter="agent-instructions" placeholder="篩選 agent instructions"></div>
      <div class="guidance" id="agent-storage-guidance"></div>
      <table data-table="agent-instructions"></table>
    </section>
    <section id="workspace-predictor" class="table-view">
      <div class="toolbar">
        <h2 data-i18n="sections.workspacePredictor">Workspace Rule Predictor</h2>
        <div class="inline-actions predictor-actions">
          <input id="workspace-predictor-path" placeholder="Q:\\\\Projects\\\\example-app" aria-label="Workspace path">
          <button class="action-button" type="button" id="workspace-predictor-run" data-i18n="workspacePredictor.run">Predict</button>
          <button class="action-button" type="button" id="workspace-predictor-rules-mode" data-rules-mode="compact" data-i18n="workspacePredictor.ruleList.showFull">Show full rules</button>
          <button class="action-button" type="button" id="workspace-predictor-clear" data-i18n="workspacePredictor.clear">Clear</button>
        </div>
      </div>
      <div class="guidance">
        <div><strong data-i18n="workspacePredictor.label">Prediction model:</strong> <span data-i18n="workspacePredictor.body">Enter a local workspace path to preview which governance layers, safety gates, and verification checks an agent should expect before touching the project.</span></div>
      </div>
      <div class="prediction-layout">
        <div class="prediction-summary" id="workspace-prediction-summary"></div>
        <div class="prediction-tabs" role="tablist" aria-label="Workspace prediction tabs">
          <button type="button" data-prediction-tab="summary" aria-selected="true" data-i18n="workspacePredictor.tabs.summary">Summary</button>
          <button type="button" data-prediction-tab="rules" aria-selected="false" data-i18n="workspacePredictor.tabs.rules">Rules</button>
          <button type="button" data-prediction-tab="checks" aria-selected="false" data-i18n="workspacePredictor.tabs.checks">Checks</button>
        </div>
        <div class="prediction-panel" id="workspace-prediction-panel"></div>
      </div>
    </section>
    <section id="web-entrypoints" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.webEntrypoints">Web 入口</h2><input data-filter="web-entrypoints" placeholder="篩選 web 入口"></div>
      <div class="guidance">
        <div><strong data-i18n="webEntrypoints.label">TB2 entry:</strong> <span data-i18n="webEntrypoints.body">TB2 prod/staging health-only public web entries are listed here with the unified DevGov dashboard links. Route health is checked in Service Status.</span></div>
      </div>
      <table data-table="web-entrypoints"></table>
    </section>
    <section id="service-status" class="table-view">
      <div class="toolbar">
        <h2 data-i18n="sections.serviceStatus">Network Service Status</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
          <input data-filter="service-status" placeholder="篩選服務">
        </div>
      </div>
      <div class="guidance">
        <div><strong data-i18n="restartPolicy.label">Restart policy:</strong> <span data-i18n="restartPolicy.body">Quick Test 欄位只執行安全 health check，並回報 Doctor/restart readiness。已審查的 Doctor/restart 控制會直接顯示在狀態 flag 上；未通過 restart policy 的 service 仍維持 review-gated。</span></div>
      </div>
      <table data-table="service-status"></table>
    </section>
    <section id="service-onboarding" class="table-view">
      <div class="toolbar">
        <h2 data-i18n="sections.serviceOnboarding">Existing Project Onboarding</h2>
        <div class="inline-actions">
          <button class="action-button" type="button" id="refresh-service-onboarding" data-i18n="serviceOnboarding.runAudit">Run audit</button>
          <input data-filter="service-onboarding" placeholder="篩選補充程序">
        </div>
      </div>
      <div class="guidance">
        <div><strong data-i18n="serviceOnboarding.label">Procedure:</strong> <span data-i18n="serviceOnboarding.body">This audit cross-checks the port registry, startup registry, public routes, local agents, and Service Status readiness so we can see which registered projects still need Doctor, Quick Test, or startup supplementation.</span></div>
      </div>
      <table data-table="service-onboarding"></table>
    </section>
    <section id="web-console-events" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.webConsoleEvents">Web Console Events</h2><input data-filter="web-console-events" placeholder="篩選事件"></div>
      <table data-table="web-console-events"></table>
    </section>
  </div>
</main>
<div class="control-modal" id="service-control-dialog" role="dialog" aria-modal="true" aria-labelledby="control-dialog-title" hidden>
  <div class="control-modal-panel">
    <div class="control-modal-header">
      <div>
        <h3 id="control-dialog-title" data-i18n="controlDialog.title">Service Control</h3>
        <div class="muted" id="control-dialog-subtitle"></div>
      </div>
      <button type="button" id="control-dialog-close" aria-label="Close">×</button>
    </div>
    <div class="control-modal-status">
      <span class="pill checking" id="control-dialog-state">PENDING</span>
      <span class="inline-meta" id="control-dialog-target"></span>
    </div>
    <pre class="control-log" id="control-dialog-log"></pre>
    <div class="control-modal-actions">
      <button class="action-button" type="button" id="control-dialog-confirm" data-i18n="controlDialog.confirm" hidden>Run</button>
      <button class="action-button" type="button" id="control-dialog-cancel" data-i18n="controlDialog.cancel" hidden>Cancel</button>
      <button class="action-button" type="button" id="control-dialog-ok" data-i18n="controlDialog.close">Close</button>
    </div>
  </div>
</div>
<script>
const state = ${stateJson};
const messages = {
  en: {
    language: { code: 'en', htmlLang: 'en', switchLabel: '繁體中文', ariaPressed: 'false' },
    subtitle: 'Local governance console for ports, startup automation, public routes, and workspace readiness.',
    theme: { dark: 'Dark mode', light: 'Light mode' },
    nav: {
      overview: 'Overview',
      ports: 'Ports',
      registeredProjects: 'Registered Projects',
      agents: 'Local Agents',
      startup: 'Startup',
      routes: 'Routes',
      terminal: 'Terminal',
      apiKeys: 'API Keys',
      agentInstructions: 'Agent Instructions',
      workspacePredictor: 'Workspace Predictor',
      webEntrypoints: 'Web Entrypoints',
      serviceStatus: 'Service Status',
      serviceOnboarding: 'Onboarding',
      webConsoleEvents: 'Web Console Events'
    },
    sections: {
      ports: 'Port Registry',
      registeredProjects: 'Registered Projects',
      agents: 'Local Service Agents',
      startup: 'Startup Governance',
      routes: 'Public Routes',
      terminal: 'Terminal Profiles',
      apiKeys: 'API Key Governance',
      agentInstructions: 'Agent Instructions',
      workspacePredictor: 'Workspace Rule Predictor',
      webEntrypoints: 'Web Entrypoints',
      serviceStatus: 'Network Service Status',
      serviceOnboarding: 'Existing Project Onboarding',
      webConsoleEvents: 'Web Console Events'
    },
    placeholders: {
      ports: 'Filter ports',
      registeredProjects: 'Filter registered projects',
      agents: 'Filter local agents',
      startup: 'Filter startup',
      routes: 'Filter routes',
      terminal: 'Filter terminal',
      apiKeys: 'Filter API keys',
      agentInstructions: 'Filter agent instructions',
      workspacePredictor: 'Q:\\\\Projects\\\\example-app',
      webEntrypoints: 'Filter web entrypoints',
      serviceStatus: 'Filter services',
      serviceOnboarding: 'Filter onboarding rows',
      webConsoleEvents: 'Filter web console events'
    },
    metrics: {
      ports: 'Ports',
      registeredProjects: 'Projects',
      agents: 'Agents',
      startup: 'Startup',
      routes: 'Routes',
      profiles: 'Profiles',
      apiKeys: 'API Keys',
      instructions: 'Instructions',
      webEntrypoints: 'Web Entrypoints',
      webConsoleEvents: 'Web Console Events'
    },
    webEntrypoints: {
      label: 'TB2 entry:',
      body: 'TB2 prod/staging health-only public web entries are listed here with the unified DevGov dashboard links. Route health is checked in Service Status.'
    },
    restartPolicy: {
      label: 'Restart policy:',
      body: 'the Quick Test column runs safe health checks and reports Doctor/restart readiness. Reviewed Doctor/restart controls attach to the status flag itself; services without a complete restart policy stay review-gated.'
    },
    serviceOnboarding: {
      label: 'Procedure:',
      body: 'This audit cross-checks the port registry, startup registry, public routes, local agents, and Service Status readiness so we can see which registered projects still need Doctor, Quick Test, or startup supplementation.',
      runAudit: 'Run audit'
    },
    registeredProjects: {
      label: 'Progress tags:',
      body: 'Project progress is aggregated from existing DevGov registry fields: readiness, review status, visibility, service coverage, and next action.'
    },
      workspacePredictor: {
        label: 'Prediction model:',
        body: 'Enter a local workspace path to preview which governance layers, safety gates, and verification checks an agent should expect before touching the project.',
        run: 'Predict',
        clear: 'Clear',
        ruleList: {
          showFull: 'Show full rules',
          showCompact: 'Show compact rules',
          modeCompact: 'Compact list',
          modeFull: 'Full list',
          fullHint: 'Switch to compact mode to preview only a subset.',
          compactHint: 'Switch to full rules mode to see the complete list.'
        },
        empty: 'Enter a workspace path to generate a prediction.',
        ready: 'Governed workspace',
      review: 'Review required',
      blocked: 'Blocked by workspace policy',
      unresolved: 'Unresolved until repo files are inspected',
      detectedProject: 'Detected project',
      pathClass: 'Path class',
      tabs: {
        summary: 'Summary',
        rules: 'Rules',
        checks: 'Checks'
      },
      summaryTitle: 'Expected governance before agent work',
      summaryBody: 'The prediction is read-only and based on registered DevGov instruction taxonomy plus local workspace rules. It does not scan or mutate the selected path.',
      rulesTitle: 'Predicted rules',
      checksTitle: 'Next checks',
      risksTitle: 'Decision notes',
      ruleHeaders: {
        rule: 'Rule',
        type: 'Type',
        layer: 'Layer',
        applies: 'Applies',
        evidence: 'Evidence',
        reason: 'Reason',
        execution: 'Execution'
      },
      ruleTypes: {
        'scope-layer': 'scope-layer',
        'authority-order': 'authority-order',
        'safety-gate': 'safety-gate',
        'data-contract': 'data-contract',
        'tool-entry': 'tool-entry',
        'context-budget': 'context-budget',
        'verification': 'verification',
        'workflow-control': 'workflow-control'
      },
      ruleLayers: {
        'platform-runtime': 'platform-runtime',
        'global-home': 'global-home',
        workspace: 'workspace',
        'repo-local': 'repo-local',
        subtree: 'subtree',
        'task-request': 'task-request'
      },
      ruleApplicability: {
        PENDING: 'PENDING',
        REVIEW_REQUIRED: 'REVIEW_REQUIRED',
        BLOCKED: 'BLOCKED',
        READY: 'READY',
        EFFECTIVE: 'EFFECTIVE',
        UNRESOLVED: 'UNRESOLVED',
        NOT_APPLICABLE: 'NOT_APPLICABLE',
        REFERENCE: 'REFERENCE'
      },
      reasons: {
        empty: 'Enter a workspace path to generate a prediction.',
        workspaceOutsideQ: 'Selected path is outside the governed Q: workspace.',
        repoInstructionsUnknown: 'Target repo AGENTS.md must be inspected after selecting the workspace.',
        subtreeUnknown: 'Narrower folder overlays are unknown until the target tree is inspected.',
        loadedTaxonomy: 'Predicted from the loaded DevGov instruction taxonomy.',
        projectOutsideQ: 'Project work outside Q:\\\\ needs explicit operator direction.',
        outsideProjects: 'Q: is available, but this is not under Q:\\\\Projects.',
        selectedRepoUnknown: 'The selected repo may have its own AGENTS.md that is not loaded by this dashboard.',
        worktreeContainer: 'The path matches a governed linked-worktree container pattern.',
        loadedPolicyPathClass: 'Predicted from loaded policy and the selected path class.'
      }
    },
    controlDialog: {
      title: 'Service Control',
      confirm: 'Run',
      cancel: 'Cancel',
      close: 'Close',
      preparing: 'Preparing',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      canceled: 'Canceled'
    },
    labels: {
      dashboard: 'Dashboard',
      socket: 'Socket',
      policy: 'Policy',
      notes: 'Notes',
      missingDashboard: 'Dashboard port entry missing',
      project: 'Project',
      progress: 'Progress',
      service: 'Service',
      services: 'Services',
      visibility: 'Visibility',
      agent: 'Agent',
      kind: 'Kind',
      health: 'Health',
      startup: 'Startup',
      status: 'Status',
      id: 'ID',
      trigger: 'Trigger',
      script: 'Script',
      purpose: 'Purpose',
      hostname: 'Hostname',
      healthUrl: 'Health URL',
      localTarget: 'Local Target',
      exposure: 'Exposure',
      access: 'Access',
      name: 'Name',
      assetPolicy: 'Asset Policy',
      variable: 'Variable',
      storage: 'Storage',
      settings: 'Settings',
      type: 'Type',
      layer: 'Layer',
      requirement: 'Requirement',
      evidence: 'Evidence',
      entryUrl: 'Entry URL',
      stage: 'Stage',
      endpoint: 'Endpoint',
      quickTest: 'Quick Test',
      lastCheck: 'Last Check',
      runtimeSource: 'Runtime source',
      canonicalRegistry: 'Canonical registry',
      generatedJson: 'Generated local JSON',
      generatedText: 'Generated text index',
      unitextEndpoint: 'UniText query endpoint',
      count: 'Count',
      required: 'required',
      notRequired: 'not required',
      pending: 'pending',
      doctor: 'Doctor',
      restart: 'Restart',
      readiness: 'Readiness',
      nextAction: 'Next Action',
      tags: 'Tags',
      sources: 'Sources',
      gaps: 'Gaps',
      links: 'Quick Links',
      noGaps: 'none',
      eventType: 'Event Type',
      source: 'Source',
      path: 'Path',
      details: 'Details',
      action: 'Action',
      time: 'Time',
      rule: 'Rule',
      applies: 'Applies',
      reason: 'Reason',
      command: 'Command',
      when: 'When',
      openCard: 'Open',
      zhTwCompanion: 'Traditional Chinese'
    }
  },
  zhTw: {
    language: { code: 'zhTw', htmlLang: 'zh-Hant', switchLabel: 'English', ariaPressed: 'true' },
    subtitle: '本機治理主控台：集中檢查 ports、startup automation、public routes 與 workspace readiness。',
    theme: { dark: '深色模式', light: '淺色模式' },
    nav: {
      overview: '總覽',
      ports: 'Ports',
      registeredProjects: '本機登記專案',
      agents: '本機 Agents',
      startup: '啟動治理',
      routes: '公開路由',
      terminal: 'Terminal Profiles',
      apiKeys: 'API Key 治理',
      agentInstructions: 'Agent Instructions',
      workspacePredictor: '工作區預測',
      webEntrypoints: 'Web 入口',
      serviceStatus: '服務狀態',
      serviceOnboarding: '補充程序',
      webConsoleEvents: '網頁事件'
    },
    sections: {
      ports: 'Port Registry',
      registeredProjects: '本機登記專案',
      agents: '本機服務 Agents',
      startup: '啟動治理',
      routes: '公開路由',
      terminal: 'Terminal Profiles',
      apiKeys: 'API Key 治理',
      agentInstructions: 'Agent Instructions',
      workspacePredictor: '工作區規則預測',
      webEntrypoints: 'Web 入口',
      serviceStatus: 'Network Service Status',
      serviceOnboarding: '既有專案補充程序',
      webConsoleEvents: '網頁事件'
    },
    placeholders: {
      ports: '篩選 ports',
      registeredProjects: '篩選本機登記專案',
      agents: '篩選本機 agents',
      startup: '篩選啟動項目',
      routes: '篩選公開路由',
      terminal: '篩選 terminal',
      apiKeys: '篩選 API keys',
      agentInstructions: '篩選 agent instructions',
      workspacePredictor: 'Q:\\\\Projects\\\\example-app',
      webEntrypoints: '篩選 web 入口',
      serviceStatus: '篩選服務',
      serviceOnboarding: '篩選補充程序',
      webConsoleEvents: '篩選網頁事件'
    },
    metrics: {
      ports: 'Ports',
      registeredProjects: '專案',
      agents: 'Agents',
      startup: '啟動項目',
      routes: 'Routes',
      profiles: 'Profiles',
      apiKeys: 'API Keys',
      instructions: 'Instructions',
      webEntrypoints: 'Web 入口',
      webConsoleEvents: '網頁事件'
    },
    webEntrypoints: {
      label: 'TB2 entry:',
      body: 'TB2 prod/staging health-only public web entries 會在這裡直接列出，並和 DevGov dashboard 入口放在同一個視圖。實際 route health 請看 Service Status。'
    },
    restartPolicy: {
      label: 'Restart policy:',
      body: 'Quick Test 欄位只執行安全 health check，並回報 Doctor/restart readiness。已審查的 Doctor/restart 控制會直接顯示在狀態 flag 上；未通過 restart policy 的 service 仍維持 review-gated。'
    },
    serviceOnboarding: {
      label: 'Procedure:',
      body: '這份 audit 會交叉比對 port registry、startup registry、public routes、local agents 與 Service Status readiness，快速找出哪些已登記專案還缺 Doctor、Quick Test 或 startup 補件。',
      runAudit: '重跑 audit'
    },
    registeredProjects: {
      label: '進度標籤:',
      body: '專案進度由現有 DevGov registry 欄位彙整：readiness、review status、visibility、service coverage 與 next action。'
    },
      workspacePredictor: {
        label: '預測模型:',
        body: '輸入本機工作區路徑後，先預覽 agent 在動手前會受到哪些治理層、safety gate 與驗證檢查約束。',
        run: '預測',
        clear: '清除',
        ruleList: {
          showFull: '顯示完整規則',
          showCompact: '顯示精簡規則',
          modeCompact: '精簡列表',
          modeFull: '完整列表',
          fullHint: '切到精簡列表只顯示部份預覽。',
          compactHint: '切到完整列表可查看全部規則。'
        },
        empty: '輸入工作區路徑後即可生成預測。',
      ready: '符合治理工作區',
      review: '需要審查',
      blocked: '被工作區政策擋下',
      unresolved: '需讀取 repo 文件後才可判定',
      detectedProject: '辨識專案',
      pathClass: '路徑分類',
      tabs: {
        summary: '摘要',
        rules: '規則',
        checks: '檢查'
      },
      summaryTitle: 'Agent 工作前的預期治理',
      summaryBody: '這個預測只讀取已載入的 DevGov 指令分類與本機工作區規則；不掃描、不修改你輸入的路徑。',
      rulesTitle: '預測規則',
      checksTitle: '下一步檢查',
      risksTitle: '決策提示',
      ruleHeaders: {
        rule: '規則',
        type: '類型',
        layer: '治理層',
        applies: '適用性',
        evidence: '依據',
        reason: '原因',
        execution: '實際執行項目'
      },
      ruleTypes: {
        'scope-layer': '範圍層 (scope-layer)',
        'authority-order': '權限順序 (authority-order)',
        'safety-gate': '安全門檻 (safety-gate)',
        'data-contract': '資料契約 (data-contract)',
        'tool-entry': '工具入口 (tool-entry)',
        'context-budget': '脈絡預算 (context-budget)',
        'verification': '驗證 (verification)',
        'workflow-control': '流程控制 (workflow-control)'
      },
      ruleLayers: {
        'platform-runtime': '平台執行期 (platform-runtime)',
        'global-home': '使用者全域 (global-home)',
        workspace: '工作區 (workspace)',
        'repo-local': 'Repo 本地 (repo-local)',
        subtree: '子目錄 (subtree)',
        'task-request': '本次請求 (task-request)'
      },
      ruleApplicability: {
        PENDING: '待輸入 (PENDING)',
        REVIEW_REQUIRED: '需要審查 (REVIEW_REQUIRED)',
        BLOCKED: '已阻擋 (BLOCKED)',
        READY: '已就緒 (READY)',
        EFFECTIVE: '生效 (EFFECTIVE)',
        UNRESOLVED: '未判定 (UNRESOLVED)',
        NOT_APPLICABLE: '不適用 (NOT_APPLICABLE)',
        REFERENCE: '參考 (REFERENCE)'
      },
      reasons: {
        empty: '輸入工作區路徑後即可生成預測。',
        workspaceOutsideQ: '選取的路徑位於受治理的 Q: 工作區之外。',
        repoInstructionsUnknown: '選定工作區後，仍需檢查目標 repo 的 AGENTS.md。',
        subtreeUnknown: '較窄的資料夾覆寫規則需等檢查目標樹狀結構後才能判定。',
        loadedTaxonomy: '依已載入的 DevGov 指令分類預測。',
        projectOutsideQ: 'Q:\\\\ 之外的專案工作需要 operator 明確指示。',
        outsideProjects: 'Q: 可用，但此路徑不在 Q:\\\\Projects 底下。',
        selectedRepoUnknown: '選取的 repo 可能有本 dashboard 尚未載入的 AGENTS.md。',
        worktreeContainer: '此路徑符合受治理的 linked-worktree container 模式。',
        loadedPolicyPathClass: '依已載入政策與選取路徑分類預測。'
      }
    },
    controlDialog: {
      title: 'Service Control',
      confirm: '執行',
      cancel: '取消',
      close: '關閉',
      preparing: '準備執行',
      running: '執行中',
      completed: '已完成',
      failed: '失敗',
      canceled: '已取消'
    },
    labels: {
      dashboard: 'Dashboard',
      socket: 'Socket',
      policy: 'Policy',
      notes: 'Notes',
      missingDashboard: '找不到 dashboard port entry',
      project: 'Project',
      progress: '進度',
      service: 'Service',
      services: 'Services',
      visibility: 'Visibility',
      agent: 'Agent',
      kind: 'Kind',
      health: 'Health',
      startup: 'Startup',
      status: 'Status',
      id: 'ID',
      trigger: 'Trigger',
      script: 'Script',
      purpose: 'Purpose',
      hostname: 'Hostname',
      healthUrl: 'Health URL',
      localTarget: 'Local Target',
      exposure: 'Exposure',
      access: 'Access',
      name: 'Name',
      assetPolicy: 'Asset Policy',
      variable: 'Variable',
      storage: 'Storage',
      settings: 'Settings',
      type: 'Type',
      layer: 'Layer',
      requirement: 'Requirement',
      evidence: 'Evidence',
      entryUrl: 'Entry URL',
      stage: 'Stage',
      endpoint: 'Endpoint',
      quickTest: 'Quick Test',
      lastCheck: 'Last Check',
      runtimeSource: 'Runtime source',
      canonicalRegistry: 'Canonical registry',
      generatedJson: 'Generated local JSON',
      generatedText: 'Generated text index',
      unitextEndpoint: 'UniText query endpoint',
      required: 'required',
      notRequired: 'not required',
      pending: 'pending',
      doctor: 'Doctor',
      restart: 'Restart',
      readiness: 'Readiness',
      nextAction: 'Next Action',
      tags: 'Tags',
      sources: 'Sources',
      gaps: 'Gaps',
      links: 'Quick Links',
      noGaps: 'none',
      eventType: '事件類型',
      source: '來源',
      path: '路徑',
      details: '詳細',
      action: '動作',
      time: '時間',
      count: '數量',
      rule: '規則',
      applies: '適用性',
      reason: '原因',
      command: '命令',
      when: '時機',
      openCard: '進入',
      zhTwCompanion: '中文版'
    }
  }
};
let currentLanguage = localStorage.getItem('devgov-language') === 'en' ? 'en' : 'zhTw';
let serviceStatusRows = [];
let serviceOnboardingRows = [];
let webConsoleEventsRows = [];
let controlActionStates = {};
let workspacePredictionTab = localStorage.getItem('devgov-workspace-prediction-tab') || 'summary';
let workspacePredictionRulesMode = localStorage.getItem('devgov-workspace-predictor-rules-mode') === 'full' ? 'full' : 'compact';
let deckDrag = null;
let deckLayoutReady = false;
let deckZCounter = 10;
let pendingWebConsoleEventReports = Promise.resolve();
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const serviceControlMap = new Map((state.serviceControl?.entries || []).map((entry) => [String(entry.controlTargetId) + ':' + String(entry.action), entry]));
const themeButton = document.getElementById('theme-toggle');
const languageButton = document.getElementById('language-toggle');
const onboardingButton = document.getElementById('refresh-service-onboarding');
const workspacePredictorInput = document.getElementById('workspace-predictor-path');
const workspacePredictorRun = document.getElementById('workspace-predictor-run');
const workspacePredictorRulesMode = document.getElementById('workspace-predictor-rules-mode');
const workspacePredictorClear = document.getElementById('workspace-predictor-clear');
const workspacePredictionSummary = document.getElementById('workspace-prediction-summary');
const workspacePredictionPanel = document.getElementById('workspace-prediction-panel');
const controlDialog = document.getElementById('service-control-dialog');
const controlDialogTitle = document.getElementById('control-dialog-title');
const controlDialogSubtitle = document.getElementById('control-dialog-subtitle');
const controlDialogState = document.getElementById('control-dialog-state');
const controlDialogTarget = document.getElementById('control-dialog-target');
const controlDialogLog = document.getElementById('control-dialog-log');
const controlDialogClose = document.getElementById('control-dialog-close');
const controlDialogConfirm = document.getElementById('control-dialog-confirm');
const controlDialogCancel = document.getElementById('control-dialog-cancel');
const controlDialogOk = document.getElementById('control-dialog-ok');
let controlDialogConfirmResolver = null;
const savedTheme = localStorage.getItem('devgov-theme');
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.dataset.theme = savedTheme;
}
const savedWorkspacePath = localStorage.getItem('devgov-workspace-prediction-path');
if (workspacePredictorInput && savedWorkspacePath) {
  workspacePredictorInput.value = savedWorkspacePath;
}
document.body.classList.add('deck-mode');
syncThemeButton();
syncI18n();
languageButton.addEventListener('click', () => {
  currentLanguage = currentLanguage === 'zhTw' ? 'en' : 'zhTw';
  localStorage.setItem('devgov-language', currentLanguage);
  syncI18n();
  renderAll();
});
themeButton.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('devgov-theme', next);
  syncThemeButton();
});
workspacePredictorRun.addEventListener('click', () => {
  const prediction = renderWorkspacePredictor();
  reportWebConsoleEvent('workspace-predictor-run', {
    pathClass: prediction.context.pathClass,
    state: prediction.outcome.state,
    ruleCount: prediction.rules.length,
    ruleTotalCount: prediction.allRules.length
  });
});
workspacePredictorClear.addEventListener('click', () => {
  workspacePredictorInput.value = '';
  localStorage.removeItem('devgov-workspace-prediction-path');
  renderWorkspacePredictor();
});
if (workspacePredictorRulesMode) {
  workspacePredictorRulesMode.addEventListener('click', () => {
    workspacePredictionRulesMode = workspacePredictionRulesMode === 'full' ? 'compact' : 'full';
    localStorage.setItem('devgov-workspace-predictor-rules-mode', workspacePredictionRulesMode);
    renderWorkspacePredictor();
  });
}
workspacePredictorInput.addEventListener('input', () => {
  localStorage.setItem('devgov-workspace-prediction-path', workspacePredictorInput.value);
  renderWorkspacePredictor();
});
workspacePredictorInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    workspacePredictorRun.click();
  }
});
document.querySelectorAll('button[data-prediction-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    workspacePredictionTab = button.dataset.predictionTab;
    localStorage.setItem('devgov-workspace-prediction-tab', workspacePredictionTab);
    renderWorkspacePredictor();
  });
});
addEventListener('resize', () => {
  if (document.body.classList.contains('deck-mode')) layoutMetricCards();
});
const views = [...document.querySelectorAll('section')];
const buttons = [...document.querySelectorAll('nav button')];
buttons.forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.view;
  activateView(view, { updateUrl: true });
  reportWebConsoleEvent('view-switch', { view });
}));
function activateView(viewId, options = {}) {
  if (options.enterDashboard || !document.body.classList.contains('deck-mode')) {
    document.body.classList.remove('deck-mode');
    resetDeckCards();
  }
  const button = document.querySelector('nav button[data-view="' + viewId + '"]') || buttons[0];
  buttons.forEach(item => item.setAttribute('aria-selected', String(item === button)));
  views.forEach(view => view.classList.toggle('active', view.id === button.dataset.view));
  if (options.updateUrl) {
    syncViewUrl(button.dataset.view);
  }
  Motion.switchView(document.getElementById(button.dataset.view), button);
}
function syncViewUrl(viewId) {
  const hash = '#' + encodeURIComponent(viewId);
  if (location.hash !== hash) {
    history.pushState({ view: viewId }, '', hash);
  }
}
function viewFromLocation() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  return views.some((view) => view.id === hash) ? hash : '';
}
addEventListener('hashchange', () => {
  const view = viewFromLocation();
  if (view) {
    activateView(view, { enterDashboard: true });
    reportWebConsoleEvent('view-switch', { view, source: 'url-hash' });
  }
});
addEventListener('popstate', () => {
  const view = viewFromLocation();
  if (view) {
    activateView(view, { enterDashboard: true });
    reportWebConsoleEvent('view-switch', { view, source: 'browser-history' });
  }
});
document.querySelectorAll('input[data-filter]').forEach(input => {
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    if (input.dataset.filter === 'ports') renderPorts(value);
    if (input.dataset.filter === 'registered-projects') renderRegisteredProjects(value);
    if (input.dataset.filter === 'agents') renderAgents(value);
    if (input.dataset.filter === 'startup') renderStartup(value);
    if (input.dataset.filter === 'routes') renderRoutes(value);
    if (input.dataset.filter === 'terminal') renderTerminal(value);
    if (input.dataset.filter === 'api-keys') renderApiKeys(value);
    if (input.dataset.filter === 'agent-instructions') renderAgentInstructions(value);
    if (input.dataset.filter === 'web-entrypoints') renderWebEntrypoints(value);
    if (input.dataset.filter === 'service-status') renderServiceStatusTable(value, serviceStatusRows);
    if (input.dataset.filter === 'service-onboarding') renderServiceOnboardingTable(value, serviceOnboardingRows);
    if (input.dataset.filter === 'web-console-events') renderWebConsoleEventsTable(value, webConsoleEventsRows);
  });
});
function renderAll() {
  document.getElementById('metrics').innerHTML = metricDeckItems().map((item) => (
    '<button class="metric" type="button" data-card-view="' + esc(item.view) + '" data-action-label="' + tEsc('labels.openCard') + '"><strong>'
    + esc(item.value)
    + '</strong><span>'
    + esc(item.label)
    + '</span></button>'
  )).join('');
  bindMetricCards();
  bindDeckSurface();
  layoutMetricCards();
  if (!document.body.classList.contains('deck-mode')) Motion.metrics();
  renderDashboardPort();
  renderPorts(filterValue('ports'));
  renderRegisteredProjects(filterValue('registered-projects'));
  renderAgents(filterValue('agents'));
  renderStartup(filterValue('startup'));
  renderRoutes(filterValue('routes'));
  renderTerminal(filterValue('terminal'));
  renderApiKeys(filterValue('api-keys'));
  renderAgentInstructions(filterValue('agent-instructions'));
  renderWorkspacePredictor();
  renderWebEntrypoints(filterValue('web-entrypoints'));
  renderWebConsoleEventsTable(filterValue('web-console-events'), webConsoleEventsRows);
  renderAgentStorageGuidance();
  const rows = serviceStatusRows.length
    ? serviceStatusRows
    : state.serviceTargets.map(target => ({ ...target, live: { state: 'CHECKING' }, quickTest: { ...target.quickTest, state: 'CHECKING' } }));
  renderServiceStatusTable(filterValue('service-status'), rows);
  renderServiceOnboardingTable(filterValue('service-onboarding'), serviceOnboardingRows);
}
function reportWebConsoleEvent(eventType, metadata = {}) {
  const payload = {
    eventType,
    project: metadata.project ?? 'devgov-dashboard',
    source: metadata.source ?? 'dashboard',
    path: metadata.path ?? (location ? location.pathname + location.hash : '/'),
    action: metadata.action ?? eventType,
    details: serializeEventDetails(metadata),
    metadata: sanitizeEventMetadata(metadata)
  };
  pendingWebConsoleEventReports = pendingWebConsoleEventReports
    .then(() => sendWebConsoleEvent(payload))
    .catch(() => { });
}
function sanitizeText(value, maxLength = 280) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}
function serializeEventDetails(value) {
  const body = value.details ?? value.reason ?? value.message;
  if (body === undefined) return '';
  if (typeof body === 'string') return sanitizeText(body);
  try {
    return sanitizeText(JSON.stringify(body));
  } catch {
    return sanitizeText(String(body));
  }
}
function sanitizeEventMetadata(metadata) {
  const value = { ...metadata };
  delete value.path;
  delete value.action;
  delete value.details;
  delete value.reason;
  delete value.message;
  return value;
}
async function sendWebConsoleEvent(payload) {
  await fetch('/api/web-console-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
}
function metricDeckItems() {
  return [
    { label: t('metrics.ports'), value: state.summary.ports, view: 'ports' },
    { label: t('metrics.registeredProjects'), value: state.summary.registeredProjects, view: 'registered-projects' },
    { label: t('metrics.agents'), value: state.summary.localAgents, view: 'agents' },
    { label: t('metrics.startup'), value: state.summary.startupEntries, view: 'startup' },
    { label: t('metrics.routes'), value: state.summary.publicRoutes, view: 'routes' },
    { label: t('metrics.profiles'), value: state.summary.terminalProfiles, view: 'terminal' },
    { label: t('metrics.apiKeys'), value: state.summary.apiKeys, view: 'api-keys' },
    { label: t('metrics.instructions'), value: state.summary.agentInstructions, view: 'agent-instructions' },
    { label: t('metrics.webEntrypoints'), value: state.summary.webEntrypoints, view: 'web-entrypoints' },
    { label: t('metrics.webConsoleEvents'), value: state.summary.webConsoleEvents, view: 'web-console-events' }
  ];
}
function bindMetricCards() {
  document.querySelectorAll('.metric[data-card-view]').forEach((card) => {
    card.addEventListener('click', () => {
      reportWebConsoleEvent('metric-card-open', { view: card.dataset.cardView });
      if (card.dataset.dragged === 'true' || Number(card.dataset.suppressClickUntil || 0) > Date.now()) {
        card.dataset.dragged = 'false';
        return;
      }
      tapMetricCard(card, () => activateView(card.dataset.cardView, { enterDashboard: true, updateUrl: true }));
    });
    card.addEventListener('pointerdown', startCardDrag);
  });
}
function bindDeckSurface() {
  const deck = document.getElementById('metrics');
  deck.onclick = (event) => {
    if (!document.body.classList.contains('deck-mode') || event.target !== deck) return;
    tapDeckSurface();
  };
}
function layoutMetricCards() {
  if (!document.body.classList.contains('deck-mode')) return;
  const deck = document.getElementById('metrics');
  const cards = [...deck.querySelectorAll('.metric[data-card-view]')];
  if (!cards.length) return;
  deckLayoutReady = false;
  requestAnimationFrame(() => {
    const deckWidth = deck.clientWidth;
    const deckHeight = deck.clientHeight;
    const tuning = deckLayoutTuning(deckWidth);
    const mobileDeck = deckWidth <= 520;
    let mobileY = tuning.edge;
    cards.forEach((card, index) => {
      const cardWidth = card.offsetWidth || 260;
      const cardHeight = card.offsetHeight || 200;
      const maxX = Math.max(tuning.edge, deckWidth - cardWidth - tuning.edge);
      const maxY = Math.max(tuning.edge, deckHeight - cardHeight - tuning.edge);
      const x = mobileDeck ? Math.min(maxX, index % 2 === 0 ? tuning.edge : tuning.edge + 18) : randomBetween(tuning.edge, maxX);
      const y = mobileDeck ? mobileY : randomBetween(tuning.edge, maxY);
      const rotation = randomBetween(-tuning.rotation, tuning.rotation).toFixed(2) + 'deg';
      card.dataset.x = String(Math.round(x));
      card.dataset.y = String(Math.round(y));
      card.dataset.homeRotation = rotation;
      card.style.left = '0px';
      card.style.top = '0px';
      card.style.zIndex = String(2 + index);
      card.style.setProperty('--card-x', Math.round(x) + 'px');
      card.style.setProperty('--card-y', Math.round(y) + 'px');
      card.style.setProperty('--card-rotate', rotation);
      card.style.setProperty('--card-shadow-x', Math.round(randomBetween(4, tuning.shadowX)) + 'px');
      card.style.setProperty('--card-shadow-y', Math.round(randomBetween(7, tuning.shadowY)) + 'px');
      card.style.setProperty('--card-shadow-blur', Math.round(randomBetween(0, tuning.shadowBlur)) + 'px');
      card.style.setProperty('--card-shadow-alpha', String(randomBetween(.15, tuning.shadowAlpha).toFixed(2)));
      if (mobileDeck) mobileY += cardHeight + 16;
    });
    deck.style.minHeight = mobileDeck ? Math.round(mobileY + tuning.edge) + 'px' : '';
    deckZCounter = cards.length + 2;
    deckLayoutReady = true;
    Motion.deck(cards);
  });
}
function deckLayoutTuning(deckWidth) {
  if (deckWidth <= 520) {
    return { edge: 6, rotation: 4.5, shadowX: 8, shadowY: 12, shadowBlur: 2, shadowAlpha: .22 };
  }
  if (deckWidth <= 820) {
    return { edge: 8, rotation: 5.8, shadowX: 10, shadowY: 14, shadowBlur: 3, shadowAlpha: .24 };
  }
  return { edge: 12, rotation: 8, shadowX: 12, shadowY: 18, shadowBlur: 3, shadowAlpha: .27 };
}
function resetDeckCards() {
  document.querySelectorAll('.metric[data-card-view]').forEach((card) => {
    card.style.transform = '';
    card.style.boxShadow = '';
    card.classList.remove('is-dragging', 'is-pressing');
  });
}
function randomBetween(min, max) {
  return min + Math.random() * Math.max(0, max - min);
}
function startCardDrag(event) {
  if (!document.body.classList.contains('deck-mode') || event.button !== 0) return;
  const card = event.currentTarget;
  Motion.cancel(card);
  const x = Number(card.dataset.x || 0);
  const y = Number(card.dataset.y || 0);
  deckDrag = {
    card,
    startPointerX: event.clientX,
    startPointerY: event.clientY,
    startX: x,
    startY: y,
    moved: false,
    overlapping: false,
    promotedInOverlap: false
  };
  card.classList.add('is-dragging', 'is-pressing');
  try {
    card.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer checks do not always have an active pointer to capture.
  }
  card.addEventListener('pointermove', moveCardDrag);
  card.addEventListener('pointerup', endCardDrag, { once: true });
  card.addEventListener('pointercancel', endCardDrag, { once: true });
}
function moveCardDrag(event) {
  if (!deckDrag) return;
  const dx = event.clientX - deckDrag.startPointerX;
  const dy = event.clientY - deckDrag.startPointerY;
  if (Math.abs(dx) + Math.abs(dy) > 5) deckDrag.moved = true;
  const nextX = deckDrag.startX + dx;
  const nextY = deckDrag.startY + dy;
  deckDrag.card.dataset.x = String(nextX);
  deckDrag.card.dataset.y = String(nextY);
  deckDrag.card.dataset.dragged = String(deckDrag.moved);
  deckDrag.card.style.setProperty('--card-x', Math.round(nextX) + 'px');
  deckDrag.card.style.setProperty('--card-y', Math.round(nextY) + 'px');
  updateDragStacking(deckDrag.card);
  updateDragShadow(deckDrag.card, dx, dy);
}
function updateDragStacking(card) {
  const overlapping = overlapsOtherCard(card);
  if (overlapping && !deckDrag.promotedInOverlap) {
    deckZCounter += 1;
    card.style.zIndex = String(deckZCounter);
    deckDrag.promotedInOverlap = true;
  }
  if (!overlapping) {
    deckDrag.promotedInOverlap = false;
  }
  deckDrag.overlapping = overlapping;
}
function overlapsOtherCard(card) {
  const cardRect = card.getBoundingClientRect();
  return [...document.querySelectorAll('.metric[data-card-view]')].some((other) => {
    if (other === card) return false;
    const otherRect = other.getBoundingClientRect();
    return cardRect.left < otherRect.right
      && cardRect.right > otherRect.left
      && cardRect.top < otherRect.bottom
      && cardRect.bottom > otherRect.top;
  });
}
function updateDragShadow(card, dx, dy) {
  const distance = Math.min(80, Math.hypot(dx, dy));
  const directionX = Math.max(-18, Math.min(18, dx * .16 + 8));
  const directionY = Math.max(10, Math.min(30, dy * .12 + 16));
  card.style.setProperty('--card-lift', '-8px');
  card.style.setProperty('--card-shadow-x', Math.round(directionX) + 'px');
  card.style.setProperty('--card-shadow-y', Math.round(directionY + distance * .08) + 'px');
  card.style.setProperty('--card-shadow-blur', Math.round(6 + distance * .16) + 'px');
  card.style.setProperty('--card-shadow-alpha', String((.24 + distance * .003).toFixed(2)));
}
function endCardDrag(event) {
  if (!deckDrag) return;
  const card = deckDrag.card;
  const moved = deckDrag.moved;
  try {
    card.releasePointerCapture?.(event.pointerId);
  } catch {
    // Pointer capture may not exist when the drag was driven by synthetic events.
  }
  card.classList.remove('is-dragging', 'is-pressing');
  card.removeEventListener('pointermove', moveCardDrag);
  card.dataset.suppressClickUntil = moved ? String(Date.now() + 260) : '0';
  settleCardShadow(card);
  setTimeout(() => {
    card.dataset.dragged = 'false';
    deckDrag = null;
  }, 0);
}
function settleCardShadow(card) {
  card.style.setProperty('--card-lift', '0px');
  card.style.setProperty('--card-shadow-x', '8px');
  card.style.setProperty('--card-shadow-y', '12px');
  card.style.setProperty('--card-shadow-blur', '2px');
  card.style.setProperty('--card-shadow-alpha', '.22');
}
function tapMetricCard(card, onComplete) {
  if (!document.body.classList.contains('deck-mode') || !deckLayoutReady || !Motion.enabled()) {
    onComplete();
    return;
  }
  card.classList.add('is-pressing');
  settleCardShadow(card);
  const rotation = card.dataset.homeRotation || '0deg';
  const animation = Motion.animate(card, [
    {
      transform: 'translate(var(--card-x), var(--card-y)) rotate(' + rotation + ') scale(1)',
      offset: 0
    },
    {
      transform: 'translate(var(--card-x), calc(var(--card-y) + 8px)) rotate(' + rotation + ') scale(.985)',
      offset: .34
    },
    {
      transform: 'translate(var(--card-x), calc(var(--card-y) - 7px)) rotate(' + rotation + ') scale(1.015)',
      offset: .68
    },
    {
      transform: 'translate(var(--card-x), var(--card-y)) rotate(' + rotation + ') scale(1)',
      offset: 1
    }
  ], {
    duration: 230,
    easing: 'cubic-bezier(.22,.9,.26,1)',
    fill: 'none'
  });
  if (!animation) {
    onComplete();
    return;
  }
  animation.addEventListener('finish', () => {
    card.classList.remove('is-pressing');
    onComplete();
  }, { once: true });
}
function tapDeckSurface() {
  if (!document.body.classList.contains('deck-mode') || !deckLayoutReady || !Motion.enabled()) return;
  const cards = [...document.querySelectorAll('.metric[data-card-view]')];
  const stackValues = cards.map((card, index) => Number(card.style.zIndex || index));
  const minStack = Math.min(...stackValues);
  const maxStack = Math.max(...stackValues);
  const stackRange = Math.max(1, maxStack - minStack);
  cards.forEach((card, index) => {
    Motion.cancel(card);
    settleCardShadow(card);
    const x = Number(card.dataset.x || 0);
    const y = Number(card.dataset.y || 0);
    const rotation = parseFloat(card.dataset.homeRotation || '0') || 0;
    const stackDepth = (stackValues[index] - minStack) / stackRange;
    const motionScale = .24 + stackDepth * .86;
    const direction = index % 2 === 0 ? 1 : -1;
    const nudgeX = randomBetween(-11, 11) * motionScale;
    const nudgeY = randomBetween(-7, 7) * motionScale;
    const lift = randomBetween(7, 20) * motionScale;
    const rotationDelta = (randomBetween(2.4, 7.2) * motionScale) * direction;
    const counterRotation = rotation - rotationDelta * randomBetween(.32, .52);
    const peakScale = 1 + .018 * motionScale;
    const settleScale = 1 - .009 * motionScale;
    const shadowAlpha = (.2 + .18 * motionScale).toFixed(2);
    const shadowBlur = Math.round(3 + 13 * motionScale);
    const shadowY = Math.round(8 + 18 * motionScale);
    Motion.animate(card, [
      {
        transform: 'translate(' + x + 'px, ' + y + 'px) rotate(' + rotation + 'deg) scale(1)',
        boxShadow: '8px 12px 2px oklch(23% 0.018 248 / .22)',
        offset: 0
      },
      {
        transform: 'translate(' + (x + nudgeX * .55) + 'px, ' + (y - lift * .52) + 'px) rotate(' + (rotation + rotationDelta * .72) + 'deg) scale(' + peakScale + ')',
        boxShadow: '12px ' + shadowY + 'px ' + shadowBlur + 'px oklch(23% 0.018 248 / ' + shadowAlpha + ')',
        offset: .28
      },
      {
        transform: 'translate(' + (x + nudgeX) + 'px, ' + (y - lift + nudgeY) + 'px) rotate(' + (rotation + rotationDelta) + 'deg) scale(' + peakScale + ')',
        boxShadow: '15px ' + Math.round(shadowY + 5 * motionScale) + 'px ' + Math.round(shadowBlur + 4 * motionScale) + 'px oklch(23% 0.018 248 / ' + shadowAlpha + ')',
        offset: .48
      },
      {
        transform: 'translate(' + (x + nudgeX * .26) + 'px, ' + (y + 3 * motionScale) + 'px) rotate(' + counterRotation + 'deg) scale(' + settleScale + ')',
        boxShadow: '5px 7px 1px oklch(23% 0.018 248 / .2)',
        offset: .76
      },
      {
        transform: 'translate(' + x + 'px, ' + y + 'px) rotate(' + rotation + 'deg) scale(1)',
        boxShadow: '8px 12px 2px oklch(23% 0.018 248 / .22)',
        offset: 1
      }
    ], {
      duration: 290 + Math.round(110 * motionScale),
      delay: Math.round(index * 14 + randomBetween(0, 28) * motionScale),
      easing: 'cubic-bezier(.2,.9,.24,1)',
      fill: 'none'
    });
  });
}
function filterValue(name) {
  return document.querySelector('input[data-filter="' + name + '"]')?.value.toLowerCase() || '';
}
function renderDashboardPort() {
  const entry = state.dashboardPort;
  document.getElementById('dashboard-port').innerHTML = entry
    ? '<tr><th>' + tEsc('labels.dashboard') + '</th><th>' + tEsc('labels.socket') + '</th><th>' + tEsc('labels.policy') + '</th><th>' + tEsc('labels.notes') + '</th></tr><tr><td>' + esc(entry.project) + '</td><td><code>' + esc(entry.host + ':' + entry.port) + '</code></td><td>' + pill(entry.visibility) + '</td><td>' + esc(entry.notes) + '</td></tr>'
    : '<tr><td>' + tEsc('labels.missingDashboard') + '</td></tr>';
}
function renderPorts(query) {
  const rows = state.ports.filter(row => match(row, query));
  renderTable('ports', [t('labels.project'), t('labels.service'), t('labels.socket'), t('labels.visibility'), t('labels.notes')], rows.map(row => [textCell(row.project), textCell(row.service), '<code>' + esc(row.host + ':' + row.port) + '</code>', pill(row.visibility), linkify(row.notes)]));
}
function renderRegisteredProjects(query) {
  const rows = state.registeredProjects.filter(row => match(row, query));
  renderTable('registered-projects', [t('labels.project'), t('labels.progress'), t('labels.services'), t('labels.tags'), t('labels.nextAction'), t('labels.sources')], rows.map(row => [
    textCell(row.project),
    renderProjectProgressCell(row),
    renderProjectServicesCell(row),
    renderProjectTags(row),
    renderNextActionCell(row),
    renderProjectSources(row)
  ]));
}
function renderAgents(query) {
  const rows = state.localAgents.filter(row => match(row, query));
  renderTable('agents', [t('labels.agent'), t('labels.kind'), t('labels.health'), t('labels.startup'), t('labels.status')], rows.map(row => [textCell(row.displayName), textCell(row.kind), linkify(row.healthUrl), fileRef(row.startupRef), pill(row.status)]));
}
function renderStartup(query) {
  const rows = state.startupEntries.filter(row => match(row, query));
  renderTable('startup', [t('labels.id'), t('labels.trigger'), t('labels.status'), t('labels.script'), t('labels.purpose')], rows.map(row => [textCell(row.id), textCell(row.trigger), pill(row.status), fileRef(row.scriptRef), linkify(row.purpose)]));
}
function renderRoutes(query) {
  const rows = state.publicRoutes.filter(row => match(row, query));
  renderTable('routes', [t('labels.hostname'), t('labels.healthUrl'), t('labels.localTarget'), t('labels.exposure'), t('labels.access'), t('labels.status')], rows.map(row => [linkify('https://' + row.hostname), linkify(row.healthUrl), '<code>' + esc(row.localHost + ':' + row.localPort) + '</code>', textCell(row.exposureClass), row.accessRequired ? tEsc('labels.required') : tEsc('labels.notRequired'), pill(row.status)]));
}
function renderTerminal(query) {
  const rows = state.terminalProfiles.filter(row => match(row, query));
  renderTable('terminal', [t('labels.id'), t('labels.name'), t('labels.assetPolicy'), t('labels.status'), t('labels.notes')], rows.map(row => [textCell(row.id), textCell(row.name), textCell(row.assetPolicy), pill(row.status), linkify(row.notes)]));
}
function renderApiKeys(query) {
  const rows = state.apiKeys.filter(row => match(row, query));
  renderTable('api-keys', [t('labels.variable'), t('labels.service'), t('labels.storage'), t('labels.settings'), t('labels.status')], rows.map(row => [textCell(row.variableName), textCell(row.service), textCell(row.storageLocation), linkify(row.settingsUrl), pill(row.status)]));
}
function renderAgentInstructions(query) {
  const rows = state.agentInstructions.entries.filter(row => match(row, query));
  renderTable('agent-instructions', [t('labels.id'), t('labels.type'), t('labels.layer'), t('labels.requirement'), t('labels.evidence'), t('labels.status')], rows.map(row => [textCell(row.id), textCell(row.type), textCell(row.layer), linkify(row.requirement), fileRefWithCompanion(row.evidence), pill(row.status)]));
}
function renderWorkspacePredictor() {
  const prediction = buildWorkspacePrediction();
  if (workspacePredictorRulesMode) {
    workspacePredictorRulesMode.textContent = t(workspacePredictionRulesMode === 'full'
      ? 'workspacePredictor.ruleList.showCompact'
      : 'workspacePredictor.ruleList.showFull');
    workspacePredictorRulesMode.setAttribute('data-rules-mode', workspacePredictionRulesMode);
  }
  document.querySelectorAll('button[data-prediction-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.predictionTab === workspacePredictionTab));
  });
  workspacePredictionSummary.innerHTML = renderWorkspacePredictionSummary(prediction);
  if (workspacePredictionTab === 'rules') {
    workspacePredictionPanel.innerHTML = renderWorkspacePredictionRules(prediction);
  } else if (workspacePredictionTab === 'checks') {
    workspacePredictionPanel.innerHTML = renderWorkspacePredictionChecks(prediction);
  } else {
    workspacePredictionPanel.innerHTML = renderWorkspacePredictionNotes(prediction);
  }
  return prediction;
}
function buildWorkspacePrediction() {
  const model = state.workspacePrediction || { layers: [], entries: [], rules: [], checks: [] };
  const rawPath = sanitizeText(workspacePredictorInput?.value || '', 240);
  const normalizedPath = normalizeWorkspacePath(rawPath);
  const hasPath = normalizedPath.length > 0;
  const absolute = /^[A-Za-z]:[\\\\/]/.test(rawPath) || rawPath.startsWith('\\\\\\\\');
  const underQ = /^[Qq]:[\\\\/]/.test(normalizedPath);
  const underDefault = pathStartsWith(normalizedPath, model.defaultWorkspaceRoot || 'Q:\\\\Projects');
  const isDevGov = pathStartsWith(normalizedPath, (model.defaultWorkspaceRoot || 'Q:\\\\Projects') + '\\\\' + (model.devgovProjectId || 'dev-governance-kit'));
  const isWorktree = isWorktreePath(normalizedPath);
  const projectName = inferWorkspaceProjectName(normalizedPath);
  const pathClass = classifyWorkspacePath({ hasPath, absolute, underQ, underDefault, isDevGov, isWorktree });
  const outcome = workspaceOutcome({ hasPath, absolute, underQ, underDefault });
  const context = { rawPath, normalizedPath, hasPath, absolute, underQ, underDefault, isDevGov, isWorktree, projectName, pathClass };
  const checks = buildPredictedWorkspaceChecks(model, context);
  const { rules, allRules } = buildPredictedWorkspaceRules(model, context, checks);
  const notes = buildWorkspacePredictionNotes(context, outcome);
  const layers = buildPredictedWorkspaceLayers(model, context);
  return { model, context, outcome, rules, allRules, checks, notes, layers };
}
function normalizeWorkspacePath(value) {
  return sanitizeText(value, 240).replaceAll('/', '\\\\').trim();
}
function trimTrailingBackslashes(value) {
  return normalizeWorkspacePath(value).replace(/\\\\+$/, '');
}
function pathStartsWith(value, prefix) {
  const candidate = trimTrailingBackslashes(value).toLowerCase();
  const root = trimTrailingBackslashes(prefix).toLowerCase();
  return candidate === root || candidate.startsWith(root + '\\\\');
}
function isWorktreePath(value) {
  const lower = normalizeWorkspacePath(value).toLowerCase();
  return lower.includes('.worktrees\\\\') || lower.includes('-worktrees\\\\') || lower.endsWith('.worktrees') || lower.endsWith('-worktrees');
}
function inferWorkspaceProjectName(value) {
  const normalized = normalizeWorkspacePath(value);
  if (!normalized) return '';
  const parts = normalized.split('\\\\').filter(Boolean);
  if (parts.length >= 3 && /^[A-Za-z]:$/.test(parts[0]) && parts[1].toLowerCase() === 'projects') {
    const project = parts[2];
    if (project.endsWith('.worktrees') || project.endsWith('-worktrees')) {
      return project.replace(/(?:\\.worktrees|-worktrees)$/i, '') + ' worktree';
    }
    return project;
  }
  return parts[parts.length - 1] || normalized;
}
function classifyWorkspacePath(context) {
  if (!context.hasPath) return 'pending';
  if (!context.absolute) return 'relative-or-unknown';
  if (!context.underQ) return 'outside-q-drive';
  if (!context.underDefault) return 'q-drive-non-projects';
  if (context.isDevGov) return 'devgov-repo';
  if (context.isWorktree) return 'worktree-storage';
  return 'q-projects-workspace';
}
function workspaceOutcome(context) {
  if (!context.hasPath) return { state: 'PENDING', label: t('workspacePredictor.empty') };
  if (!context.absolute) return { state: 'REVIEW_REQUIRED', label: t('workspacePredictor.review') };
  if (!context.underQ) return { state: 'BLOCKED', label: t('workspacePredictor.blocked') };
  if (!context.underDefault) return { state: 'REVIEW_REQUIRED', label: t('workspacePredictor.review') };
  return { state: 'READY', label: t('workspacePredictor.ready') };
}
function buildPredictedWorkspaceLayers(model, context) {
  return (model.layers || []).map((layer) => ({
    ...layer,
    applies: layerStatusForPrediction(layer.id, context),
    reason: layerReasonForPrediction(layer.id, context)
  })).sort((left, right) => Number(left.precedence ?? 99) - Number(right.precedence ?? 99));
}
function layerStatusForPrediction(layerId, context) {
  if (!context.hasPath) return 'PENDING';
  if (layerId === 'platform-runtime' || layerId === 'global-home' || layerId === 'task-request') return 'EFFECTIVE';
  if (layerId === 'workspace') return context.underQ ? 'EFFECTIVE' : 'BLOCKED';
  if (layerId === 'repo-local') return context.isDevGov ? 'EFFECTIVE' : 'UNRESOLVED';
  if (layerId === 'subtree') return 'UNRESOLVED';
  return 'REFERENCE';
}
function layerReasonForPrediction(layerId, context) {
  if (!context.hasPath) return t('workspacePredictor.reasons.empty');
  if (layerId === 'workspace' && !context.underQ) return t('workspacePredictor.reasons.workspaceOutsideQ');
  if (layerId === 'repo-local' && !context.isDevGov) return t('workspacePredictor.reasons.repoInstructionsUnknown');
  if (layerId === 'subtree') return t('workspacePredictor.reasons.subtreeUnknown');
  return t('workspacePredictor.reasons.loadedTaxonomy');
}
function buildPredictedWorkspaceChecksByRule(checks = []) {
  const byRule = new Map();
  for (const check of checks) {
    const forRules = Array.isArray(check.forRules) ? check.forRules : [];
    for (const ruleId of forRules) {
      if (!ruleId) continue;
      const list = byRule.get(ruleId) || [];
      list.push(check);
      byRule.set(ruleId, list);
    }
  }
  return byRule;
}
function normalizeWorkspaceExecutionItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return null;
  const label = sanitizeText(rawItem.label, 80);
  const command = sanitizeText(rawItem.command, 260);
  const when = sanitizeText(rawItem.when, 120);
  if (!label && !command && !when) return null;
  return {
    label: label || '-',
    command: command || '-',
    when: when || '-',
    source: sanitizeText(rawItem.source, 80) || 'rule'
  };
}
function buildWorkspaceRuleExecution(rule, checksByRule) {
  const seen = new Set();
  const result = [];
  const add = (rawItem) => {
    const item = normalizeWorkspaceExecutionItem(rawItem);
    if (!item) return;
    const key = item.label + '|' + item.command + '|' + item.when;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  };

  for (const item of Array.isArray(rule.execution) ? rule.execution : []) {
    add(item);
  }
  for (const check of checksByRule.get(rule.id) || []) {
    add({
      label: check.label,
      command: check.command,
      when: check.when,
      source: 'check.' + String(check.id || '')
    });
  }
  return result;
}
function buildPredictedWorkspaceRules(model, context, checks = []) {
  const checksByRule = buildPredictedWorkspaceChecksByRule(checks);
  const explicitRules = (model.rules || []).map((rule) => ({
    id: rule.id,
    type: rule.type,
    layer: rule.layer,
    requirement: rule.requirement,
    evidence: rule.evidence,
    execution: buildWorkspaceRuleExecution(rule, checksByRule),
    applies: explicitRuleStatus(rule.id, context),
    reason: explicitRuleReason(rule.id, context)
  }));
  const registryRules = (model.entries || []).map((entry) => ({
    id: entry.id,
    type: entry.type,
    layer: entry.layer,
    requirement: entry.requirement,
    evidence: entry.evidence,
    execution: buildWorkspaceRuleExecution(entry, checksByRule),
    applies: layerStatusForPrediction(entry.layer, context),
    reason: layerReasonForPrediction(entry.layer, context)
  }));
  const allRules = [...explicitRules, ...registryRules];
  const compactLimit = 14;
  return {
    rules: workspacePredictionRulesMode === 'full' ? allRules : allRules.slice(0, compactLimit),
    allRules
  };
}
function explicitRuleStatus(ruleId, context) {
  if (!context.hasPath) return 'PENDING';
  if (ruleId === 'workspace.location.q-projects') {
    if (!context.underQ) return 'BLOCKED';
    return context.underDefault ? 'EFFECTIVE' : 'REVIEW_REQUIRED';
  }
  if (ruleId === 'workspace.git.pre-edit') return 'EFFECTIVE';
  if (ruleId === 'workspace.repo-instruction-discovery') return context.isDevGov ? 'EFFECTIVE' : 'UNRESOLVED';
  if (ruleId === 'workspace.subtree-instruction-discovery') return 'UNRESOLVED';
  if (ruleId === 'workspace.worktree-container') return context.isWorktree ? 'EFFECTIVE' : 'NOT_APPLICABLE';
  if (ruleId === 'workspace.registry-redaction-boundary') return context.isDevGov ? 'EFFECTIVE' : 'REFERENCE';
  return 'EFFECTIVE';
}
function explicitRuleReason(ruleId, context) {
  if (!context.hasPath) return t('workspacePredictor.reasons.empty');
  if (ruleId === 'workspace.location.q-projects' && !context.underQ) return t('workspacePredictor.reasons.projectOutsideQ');
  if (ruleId === 'workspace.location.q-projects' && !context.underDefault) return t('workspacePredictor.reasons.outsideProjects');
  if (ruleId === 'workspace.repo-instruction-discovery' && !context.isDevGov) return t('workspacePredictor.reasons.selectedRepoUnknown');
  if (ruleId === 'workspace.worktree-container' && context.isWorktree) return t('workspacePredictor.reasons.worktreeContainer');
  return t('workspacePredictor.reasons.loadedPolicyPathClass');
}
function buildPredictedWorkspaceChecks(model, context) {
  const projectSlug = slugProjectName(context.projectName || 'workspace');
  const selected = context.normalizedPath || '<workspace>';
  const checks = [
    ...(model.checks || []),
    {
      id: 'check.selected-scan-project',
      label: 'Selected project scan',
      command: 'node scripts/scan-project.mjs ' + quoteCommandArg(selected) + ' --out reports/' + projectSlug + '-port-audit.md',
      when: 'When the selected workspace has web or local service ports',
      forRules: ['workspace.scan-readonly-first']
    }
  ];
  if (context.isDevGov) {
    checks.push(
      { id: 'check.devgov-test', label: 'DevGov tests', command: 'npm test', when: 'Before reporting dashboard changes complete', forRules: ['workspace.scan-readonly-first', 'workspace.repo-instruction-discovery'] },
      { id: 'check.devgov-agents', label: 'AGENTS index', command: 'npm run scan:agents', when: 'After changing AGENTS governance surfaces', forRules: ['workspace.repo-instruction-discovery', 'workspace.subtree-instruction-discovery'] },
      { id: 'check.devgov-registry', label: 'Registry validation', command: 'npm run validate:registry', when: 'After registry-facing changes', forRules: ['workspace.registry-redaction-boundary'] },
      { id: 'check.devgov-doctor', label: 'Doctor', command: 'npm run doctor', when: 'Before final DevGov handoff', forRules: ['workspace.scan-readonly-first'] }
    );
  }
  if (context.isWorktree) {
    checks.push({
      id: 'check.selected-worktree',
      label: 'Worktree governance',
      command: 'npm run scan:worktrees -- Q:\\\\Projects --out reports/worktree-audit.md',
      when: 'Because the selected path looks like linked worktree storage',
      forRules: ['workspace.worktree-container']
    });
  }
  return checks;
}
function buildWorkspacePredictionNotes(context, outcome) {
  const notes = [];
  if (!context.hasPath) {
    notes.push({ state: 'PENDING', title: t('workspacePredictor.empty'), body: t('workspacePredictor.summaryBody') });
    return notes;
  }
  notes.push({ state: outcome.state, title: outcome.label, body: 'Path class: ' + context.pathClass });
  if (!context.absolute) {
    notes.push({ state: 'REVIEW_REQUIRED', title: 'Absolute path required', body: 'Use a full local path so workspace, repo-local, and subtree scopes can be predicted.' });
  }
  if (!context.underQ) {
    notes.push({ state: 'BLOCKED', title: 'Outside Q: workspace', body: 'Project development outside Q:\\\\ needs explicit operator direction before continuing.' });
  } else if (!context.underDefault) {
    notes.push({ state: 'REVIEW_REQUIRED', title: 'Outside Q:\\\\Projects', body: 'Q: is governed, but project work normally belongs under Q:\\\\Projects.' });
  }
  if (!context.isDevGov) {
    notes.push({ state: 'UNRESOLVED', title: t('workspacePredictor.unresolved'), body: 'Repo-local and subtree rules remain unknown until the selected project files are inspected.' });
  } else {
    notes.push({ state: 'EFFECTIVE', title: 'DevGov repo-local rules apply', body: 'Registry redaction, dashboard verification, and AGENTS governance checks are expected for this workspace.' });
  }
  if (context.isWorktree) {
    notes.push({ state: 'EFFECTIVE', title: 'Worktree governance applies', body: 'Treat the selected path as operational linked-worktree storage and keep cleanup read-only unless separately approved.' });
  }
  return notes;
}
function renderWorkspacePredictionSummary(prediction) {
  const context = prediction.context;
  const ruleCountLabel = prediction.rules.length === prediction.allRules.length
    ? String(prediction.allRules.length)
    : prediction.rules.length + '/' + prediction.allRules.length;
  const facts = [
    [t('labels.path'), context.normalizedPath || t('workspacePredictor.empty')],
    [t('workspacePredictor.detectedProject'), context.projectName || '-'],
    [t('workspacePredictor.pathClass'), context.pathClass],
    [t('labels.rule'), ruleCountLabel]
  ];
  return '<div class="prediction-headline">'
    + pill(prediction.outcome.state)
    + '<strong>' + esc(t('workspacePredictor.summaryTitle')) + '</strong>'
    + '<span class="muted">' + esc(prediction.outcome.label) + '</span>'
    + '<span>' + esc(t('workspacePredictor.summaryBody')) + '</span>'
    + '</div><div class="prediction-facts">'
    + facts.map(([label, value]) => '<div class="guidance-row"><strong>' + esc(label) + '</strong><span>' + esc(value) + '</span></div>').join('')
    + '</div>';
}
function renderWorkspacePredictionNotes(prediction) {
  return '<div class="prediction-cards">'
    + prediction.notes.map((note) => '<article class="prediction-card">' + pill(note.state) + '<h3>' + esc(note.title) + '</h3><span>' + esc(note.body) + '</span></article>').join('')
    + '</div>'
    + renderPredictionTable([t('labels.layer'), t('labels.applies'), t('labels.reason')], prediction.layers.map((layer) => [
      textCell(layer.id),
      pill(layer.applies),
      textCell(layer.reason)
    ]));
}
function workspaceRuleTypeBucket(rule) {
  return String(rule?.type || 'unknown').toLowerCase();
}
function workspaceRuleLayerBucket(rule) {
  return String(rule?.layer || 'unknown').toLowerCase();
}
function workspaceRuleTypeWeight(type) {
  const order = [
    'scope-layer',
    'authority-order',
    'safety-gate',
    'data-contract',
    'tool-entry',
    'context-budget',
    'verification',
    'workflow-control'
  ];
  const normalized = workspaceRuleTypeBucket(type);
  const index = order.indexOf(normalized);
  return index === -1 ? order.length : index;
}
function workspaceRuleLayerWeight(layer) {
  const order = [
    'platform-runtime',
    'global-home',
    'workspace',
    'repo-local',
    'subtree',
    'task-request'
  ];
  const normalized = workspaceRuleLayerBucket(layer);
  const index = order.indexOf(normalized);
  return index === -1 ? order.length : index;
}
function groupWorkspacePredictionRules(rules) {
  const buckets = new Map();
  for (const rule of rules) {
    const layer = workspaceRuleLayerBucket(rule);
    const type = workspaceRuleTypeBucket(rule);
    const existingLayer = buckets.get(layer) ?? {};
    const typeBuckets = existingLayer.types ?? new Map();
    const typeList = typeBuckets.get(type) ?? [];
    typeList.push(rule);
    typeBuckets.set(type, typeList);
    buckets.set(layer, { total: (existingLayer.total ?? 0) + 1, types: typeBuckets });
  }
  return [...buckets.entries()]
    .sort((left, right) => {
      const layerWeight = workspaceRuleLayerWeight(left[0]) - workspaceRuleLayerWeight(right[0]);
      if (layerWeight !== 0) return layerWeight;
      return left[0].localeCompare(right[0], 'en');
    })
    .map(([layer, { total, types }]) => ({
      layer,
      total,
      types: [...types.entries()]
        .sort((left, right) => {
          const typeWeight = workspaceRuleTypeWeight(left[0]) - workspaceRuleTypeWeight(right[0]);
          if (typeWeight !== 0) return typeWeight;
          return left[0].localeCompare(right[0], 'en');
        })
        .map(([type, rows]) => ({
          type,
          rules: rows.sort((left, right) => String(left.id).localeCompare(String(right.id), 'en'))
        }))
    }));
}
function renderWorkspacePredictionRulesSummary(prediction) {
  const isFull = prediction.rules.length === prediction.allRules.length;
  const modeLabel = t(isFull ? 'workspacePredictor.ruleList.modeFull' : 'workspacePredictor.ruleList.modeCompact');
  const listHint = t(isFull ? 'workspacePredictor.ruleList.fullHint' : 'workspacePredictor.ruleList.compactHint');
  const summaryRules = prediction.allRules;
  return '<div class="prediction-rule-summary">'
    + '<div><strong>' + esc(modeLabel) + '</strong> · ' + esc(t('workspacePredictor.summaryBody')) + '</div>'
    + '<p>' + esc(listHint) + '</p>'
    + renderPredictionTable(
      [t('labels.type'), t('labels.count')],
      Object.entries(summaryRules.reduce((acc, rule) => {
        const type = workspaceRuleTypeBucket(rule);
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}))
        .sort((left, right) => {
          const weightLeft = workspaceRuleTypeWeight(left[0]);
          const weightRight = workspaceRuleTypeWeight(right[0]);
          if (weightLeft !== weightRight) return weightLeft - weightRight;
          return left[0].localeCompare(right[0], 'en');
        })
        .map(([type, count]) => [
          localizedWorkspaceRuleCell('ruleTypes', type),
          textCell(String(count))
        ])
    )
    + '</div>';
}
function renderWorkspacePredictionRuleBuckets(prediction) {
  const groups = groupWorkspacePredictionRules(prediction.rules);
  if (!groups.length) {
    return '<div class="prediction-rule-empty"><code>' + esc(t('workspacePredictor.empty')) + '</code></div>';
  }
  return groups.map(({ layer, total, types }) => {
    const typeSections = types.map(({ type, rules }) => {
        return '<details class="prediction-rule-group" open>'
        + '<summary><strong>' + esc(localizedWorkspaceRuleCell('ruleTypes', type)) + '</strong> <span>' + esc(String(rules.length)) + ' rule' + (rules.length > 1 ? 's' : '') + '</span></summary>'
        + renderPredictionTable([
          t('workspacePredictor.ruleHeaders.rule'),
          t('workspacePredictor.ruleHeaders.applies'),
          t('workspacePredictor.ruleHeaders.evidence'),
          t('workspacePredictor.ruleHeaders.reason'),
          t('workspacePredictor.ruleHeaders.execution')
        ], rules.map((rule) => [
          textCell(rule.id),
          localizedWorkspaceRulePill(rule.applies),
          fileRefWithCompanion(rule.evidence),
          textCell(rule.reason),
          renderWorkspaceRuleExecution(rule.execution)
        ]))
        + '</details>';
    }).join('');
    return '<section class="prediction-rule-layer">'
      + '<h4>' + esc(localizedWorkspaceRuleCell('ruleLayers', layer)) + ' · ' + esc(String(total)) + '</h4>'
      + typeSections
      + '</section>';
  }).join('');
}
function renderWorkspaceRuleExecution(execution) {
  const items = Array.isArray(execution) ? execution : [];
  if (!items.length) return textCell('—');
  return '<ul class="prediction-rule-exec-list">' + items.map((item) => {
    const source = item.source
      ? '<div><span class="muted">' + esc(t('labels.source')) + ': ' + esc(item.source) + '</span></div>'
      : '';
    const when = item.when
      ? '<div><span class=\"muted\">' + esc(t('labels.when')) + ': ' + esc(item.when) + '</span></div>'
      : '';
    return '<li class="prediction-rule-exec-item"><strong>' + esc(item.label || t('labels.command')) + '</strong>'
      + '<div><code>' + esc(item.command || '-') + '</code></div>'
      + source
      + when
      + '</li>';
  }).join('') + '</ul>';
}
function renderWorkspacePredictionRules(prediction) {
  const ruleCountLabel = prediction.rules.length === prediction.allRules.length
    ? String(prediction.allRules.length)
    : prediction.rules.length + '/' + prediction.allRules.length;
  const rulesTitle = t('workspacePredictor.rulesTitle') + ' (' + ruleCountLabel + ')';
  return '<div class="guidance"><strong>' + esc(rulesTitle) + '</strong><span>' + esc(t('workspacePredictor.summaryBody')) + '</span></div>'
    + renderWorkspacePredictionRulesSummary(prediction)
    + renderWorkspacePredictionRuleBuckets(prediction);
}
function localizedWorkspaceRuleCell(group, value) {
  return textCell(localizedWorkspaceRuleValue(group, value));
}
function localizedWorkspaceRulePill(value) {
  return '<span class="pill ' + esc(String(value).toLowerCase()) + '">' + esc(localizedWorkspaceRuleValue('ruleApplicability', value)) + '</span>';
}
function localizedWorkspaceRuleValue(group, value) {
  const fallback = String(value || '');
  const key = 'workspacePredictor.' + group + '.' + fallback;
  const translated = t(key);
  return translated === key ? fallback : translated;
}
function renderWorkspacePredictionChecks(prediction) {
  return '<div class="guidance"><strong>' + esc(t('workspacePredictor.checksTitle')) + '</strong><span>' + esc(t('workspacePredictor.summaryBody')) + '</span></div>'
    + renderPredictionTable([t('labels.rule'), t('labels.when'), t('labels.command')], prediction.checks.map((check) => [
      textCell(check.label),
      textCell(check.when),
      '<code>' + esc(check.command) + '</code>'
    ]));
}
function renderPredictionTable(headers, rows) {
  return '<table><tr>' + headers.map(header => '<th>' + esc(header) + '</th>').join('') + '</tr>'
    + rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('')
    + '</table>';
}
function quoteCommandArg(value) {
  return '"' + String(value || '').replaceAll('"', '""') + '"';
}
function slugProjectName(value) {
  return String(value || 'workspace').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}
function renderWebEntrypoints(query) {
  const rows = state.webEntrypoints.filter(row => match(row, query));
  renderTable('web-entrypoints', [t('labels.project'), t('labels.stage'), t('labels.entryUrl'), t('labels.health'), t('labels.localTarget'), t('labels.access'), t('labels.status')], rows.map(row => [
    textCell(row.project),
    textCell(row.stage),
    linkify(row.url),
    linkify(row.healthUrl),
    '<code>' + esc(row.target) + '</code>',
    row.accessRequired ? tEsc('labels.required') : tEsc('labels.notRequired'),
    pill(row.status)
  ]));
}
function renderWebConsoleEventsTable(query, rows) {
  const filtered = rows.filter(row => match(row, query));
  renderTable('web-console-events', [t('labels.time'), t('labels.eventType'), t('labels.project'), t('labels.source'), t('labels.path'), t('labels.action'), t('labels.details')], filtered.map(row => [
    textCell(row.receivedAt || row.receivedTime || ''),
    textCell(row.eventType),
    textCell(row.project),
    textCell(row.source),
    textCell(row.path),
    textCell(row.action),
    textCell(row.details || '')
  ]));
}
function renderAgentStorageGuidance() {
  document.getElementById('agent-storage-guidance').innerHTML = [
    [t('labels.runtimeSource'), fileRefWithCompanion(state.agentInstructions.sourceOfTruth)],
    [t('labels.canonicalRegistry'), fileRef('registry/agent-instructions.registry.json')],
    [t('labels.generatedJson'), fileRef('reports/agent-instructions-index.json')],
    [t('labels.generatedText'), fileRef('reports/agent-instructions-index.txt')],
    [t('labels.unitextEndpoint'), intenalLink('/api/unitext-agent-instructions')]
  ].map(([label, value]) => '<div class="guidance-row"><strong>' + esc(label) + '</strong><span>' + value + '</span></div>').join('');
}
function renderServiceStatusTable(query, rows) {
  const filtered = rows.filter(row => match(row, query));
  renderTable('service-status', [t('labels.service'), t('labels.endpoint'), t('labels.quickTest'), t('labels.lastCheck')], filtered.map(row => [
    renderServiceCell(row),
    renderEndpointCell(row),
    renderQuickTestCell(row),
    renderLastCheckCell(row)
  ]));
}
function renderServiceOnboardingTable(query, rows) {
  const filtered = rows.filter(row => match(row, query));
  renderTable('service-onboarding', [t('labels.project'), t('labels.service'), t('labels.socket'), t('labels.readiness'), t('labels.gaps'), t('labels.links')], filtered.map(row => [
    textCell(row.project),
    textCell(row.service),
    '<code>' + esc(row.socket) + '</code>',
    pill(row.readiness),
    renderGapCell(row),
    renderOnboardingLinks(row)
  ]));
}
async function refreshServiceStatus() {
  try {
    const response = await fetch('/api/service-status');
    const payload = await response.json();
    serviceStatusRows = payload.services || [];
  } catch (error) {
    serviceStatusRows = state.serviceTargets.map(target => ({ ...target, live: { state: 'ERROR', error: error.message } }));
  } finally {
    renderServiceStatusTable(document.querySelector('input[data-filter="service-status"]').value.toLowerCase(), serviceStatusRows);
  }
}
async function refreshServiceOnboarding() {
  onboardingButton.disabled = true;
  try {
    const response = await fetch('/api/service-onboarding');
    const payload = await response.json();
    serviceOnboardingRows = payload.services || [];
  } catch (error) {
    serviceOnboardingRows = [];
  } finally {
    onboardingButton.disabled = false;
    renderServiceOnboardingTable(filterValue('service-onboarding'), serviceOnboardingRows);
  }
}
async function refreshWebConsoleEvents() {
  try {
    const response = await fetch('/api/web-console-events');
    const payload = await response.json();
    webConsoleEventsRows = payload.events || [];
  } catch {
    webConsoleEventsRows = [];
  } finally {
    renderWebConsoleEventsTable(filterValue('web-console-events'), webConsoleEventsRows);
  }
}
function renderProjectProgressCell(row) {
  const percent = Math.max(0, Math.min(100, Number(row.progressPercent || 0)));
  const counts = Object.entries(row.readinessCounts || {})
    .map(([label, count]) => label + '=' + count)
    .join(' ');
  return '<div class="project-progress-cell">'
    + '<div class="tag-list">' + pill(row.progressTag) + '<span class="inline-meta">' + esc(percent + '%') + '</span></div>'
    + '<div class="progress-track" aria-label="' + esc(row.progressTag + ' ' + percent + '%') + '"><div class="progress-bar" style="width:' + esc(percent) + '%"></div></div>'
    + '<span class="inline-meta">' + esc(counts || 'no readiness tag') + '</span>'
    + '</div>';
}
function renderProjectServicesCell(row) {
  const services = (row.services || []).slice(0, 4);
  const extra = Math.max(0, (row.services || []).length - services.length);
  return '<div class="project-services-cell">'
    + '<strong>' + esc(row.serviceCount) + '</strong>'
    + '<span>' + esc(services.join(', ') || '-') + (extra ? esc(' +' + extra) : '') + '</span>'
    + '</div>';
}
function renderProjectTags(row) {
  const tags = row.tags || [];
  if (!tags.length) return '<span class="inline-meta">' + tEsc('labels.pending') + '</span>';
  return '<div class="tag-list">' + tags.slice(0, 8).map(pill).join('') + '</div>';
}
function renderNextActionCell(row) {
  return '<div class="next-action-cell"><span>' + esc(row.nextAction || '-') + '</span></div>';
}
function renderProjectSources(row) {
  const refs = [...(row.sourceRefs || []), ...(row.reviewEvidence || [])];
  if (!refs.length) return '<span class="inline-meta">' + tEsc('labels.pending') + '</span>';
  return '<div class="source-link-list">' + refs.slice(0, 3).map((ref) => fileRef(ref)).join('') + '</div>';
}
function renderQuickTestCell(row) {
  return '<div class="check-grid">'
    + checkRow(t('labels.health'), row.quickTest?.state || row.live?.state || 'CHECKING')
    + renderActionRow(row, 'doctor', row.doctor)
    + renderActionRow(row, 'restart', row.restart)
    + checkRow(t('labels.readiness'), row.controlReadiness || 'BLOCKED')
    + '</div>';
}
function checkRow(label, state, ref) {
  return '<div class="check-row"><span class="check-label">' + esc(label) + '</span><span class="check-status">' + (ref ? linkedPill(state, ref, label) : pill(state)) + '</span><span class="check-detail"></span></div>';
}
function renderActionRow(row, action, actionStatus) {
  const actionKey = String(row.controlTargetId) + ':' + String(action);
  const control = serviceControlMap.get(actionKey);
  const actionState = controlActionStates[actionKey];
  const label = control?.uiLabel || t('labels.' + action);
  const state = actionStatus?.state || 'MISSING';
  const isRestart = action === "restart";
  const restartPolicyReady = isRestart ? actionStatus?.policyReadiness?.complete === true : true;
  const restartBlocked = isRestart && !restartPolicyReady;
  const status = control?.approved && !restartBlocked
    ? actionControlPill(row, action, state, control, actionState)
    : (actionStatus?.ref ? linkedPill(state, actionStatus.ref, label) : pill(state));
  const details = [];
  if (isRestart && actionStatus?.policyReadiness) {
    if (!actionStatus.policyReadiness.complete) {
      details.push('<span class="inline-meta">' + esc(actionStatus.policyReadiness.policyMessage || 'Restart policy is incomplete') + '</span>');
    }
  } else if (isRestart && control?.approved) {
    details.push('<span class="inline-meta">Restart policy evidence missing in registry</span>');
  }
  if (actionState?.message) {
    details.push('<span class="inline-meta">' + esc(actionState.message) + '</span>');
  }
  return '<div class="check-row"><span class="check-label">' + esc(label) + '</span><span class="check-status">' + status + '</span><span class="check-detail">' + details.join('') + '</span></div>';
}
function actionControlPill(row, action, state, control, actionState) {
  const label = control?.uiLabel || t('labels.' + action);
  const targetLabel = row.label || row.id || row.controlTargetId;
  const actionText = currentLanguage === 'zhTw'
    ? '執行 ' + label + ': ' + targetLabel
    : 'Run ' + label + ': ' + targetLabel;
  const title = control?.wrapperRef ? actionText + ' (' + control.wrapperRef + ')' : actionText;
  return '<button class="pill status-action ' + esc(String(state).toLowerCase()) + '" type="button" data-service-action="' + esc(action) + '" data-control-target="' + esc(row.controlTargetId) + '"' + (actionState?.pending ? ' disabled' : '') + ' title="' + esc(title) + '" aria-label="' + esc(actionText) + '"><span>' + esc(state) + '</span><span class="action-key" aria-hidden="true">&#128477;&#65039;</span></button>';
}
function renderServiceCell(row) {
  return '<div class="service-cell">'
    + '<div class="service-badges">' + pill(row.live?.state || 'CHECKING') + pill(row.registryStatus) + '</div>'
    + '<span class="service-name">' + esc(row.label) + '</span>'
    + '<span class="inline-meta">' + esc(row.kind) + '</span>'
    + '</div>';
}
function renderEndpointCell(row) {
  return '<div class="endpoint-cell">' + linkify(row.url) + '<span class="inline-meta">' + esc(row.target) + '</span></div>';
}
function renderLastCheckCell(row) {
  if (!row.live?.checkedAt) {
    return '<div class="last-check-cell"><span>' + tEsc('labels.pending') + '</span></div>';
  }
  return '<div class="last-check-cell"><span>' + esc(row.live.checkedAt) + '</span>'
    + (row.live.statusCode ? '<span class="inline-meta">status=' + esc(row.live.statusCode) + '</span>' : '')
    + (row.live.error ? '<span class="inline-meta">' + esc(row.live.error) + '</span>' : '')
    + '</div>';
}
function renderGapCell(row) {
  if (!row.gaps?.length) {
    return '<span>' + tEsc('labels.noGaps') + '</span>';
  }
  return row.gaps.map(gap => '<span class="inline-meta">' + esc(gap) + '</span>').join('');
}
function renderOnboardingLinks(row) {
  const links = row.quickLinks || [];
  if (!links.length) return '<span class="inline-meta">' + tEsc('labels.pending') + '</span>';
  return '<div class="inline-actions">' + links.map(renderOnboardingLink).join('') + '</div>';
}
function renderOnboardingLink(link) {
  if (link.type === 'url') {
    return '<a class="pill pill-link" href="' + esc(link.target) + '" target="_blank" rel="noreferrer">' + esc(link.label) + '</a>';
  }
  return fileRefLink(link.label, link.target);
}
function renderTable(name, headers, rows) {
  document.querySelector('[data-table="' + name + '"]').innerHTML = '<tr>' + headers.map(header => '<th>' + esc(header) + '</th>').join('') + '</tr>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('');
  bindServiceControlButtons();
  Motion.rows(name);
}
function bindServiceControlButtons() {
  document.querySelectorAll('button[data-service-action]').forEach((button) => {
    button.onclick = () => runServiceControl(button.dataset.controlTarget, button.dataset.serviceAction);
  });
}
async function runServiceControl(controlTargetId, action) {
  const actionKey = String(controlTargetId) + ':' + String(action);
  const control = serviceControlMap.get(actionKey);
  const target = findServiceControlTarget(controlTargetId);
  openControlDialog({
    controlTargetId,
    action,
    title: t('labels.' + action),
    targetLabel: target?.label || controlTargetId,
    wrapperRef: control?.wrapperRef || ''
  });
  if (control?.requiresConfirmation) {
    setControlDialogMode('confirm');
    appendControlLog(currentLanguage === 'zhTw'
      ? '這個動作會嘗試調整本機 runtime，需先確認。'
      : 'This action may adjust the local runtime and requires confirmation.');
    const confirmed = await waitForControlDialogConfirmation();
    if (!confirmed) {
      setControlDialogMode('canceled');
      appendControlLog(currentLanguage === 'zhTw' ? '使用者取消執行。' : 'Canceled by operator.');
      controlActionStates[actionKey] = { pending: false, message: t('controlDialog.canceled') };
      renderServiceStatusTable(filterValue('service-status'), serviceStatusRows);
      return;
    }
  }
  setControlDialogMode('running');
  appendControlLog((currentLanguage === 'zhTw' ? '送出控制請求: ' : 'Sending control request: ') + actionKey);
  if (control?.wrapperRef) appendControlLog('wrapper=' + control.wrapperRef);
  controlActionStates[actionKey] = { pending: true, message: currentLanguage === 'zhTw' ? '執行中...' : 'Running...' };
  renderServiceStatusTable(filterValue('service-status'), serviceStatusRows);
  try {
    const response = await fetch(state.serviceControl.baseUrl + '/api/service-control/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ controlTargetId, action })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || payload.summary || 'Control action failed');
    }
    appendControlLog('eventId=' + (payload.eventId || 'n/a'));
    appendControlLog('summary=' + (payload.summary || 'Completed'));
    controlActionStates[actionKey] = {
      pending: false,
      message: payload.summary || (currentLanguage === 'zhTw' ? '已完成' : 'Completed')
    };
    await refreshServiceStatus();
    appendControlLog(currentLanguage === 'zhTw' ? '服務狀態已刷新。' : 'Service Status refreshed.');
    setControlDialogMode('completed');
  } catch (error) {
    appendControlLog('error=' + error.message);
    setControlDialogMode('failed');
    controlActionStates[actionKey] = { pending: false, message: error.message };
    renderServiceStatusTable(filterValue('service-status'), serviceStatusRows);
  }
}
function findServiceControlTarget(controlTargetId) {
  return serviceStatusRows.find((row) => row.controlTargetId === controlTargetId)
    || state.serviceTargets.find((row) => row.controlTargetId === controlTargetId);
}
function openControlDialog({ controlTargetId, action, title, targetLabel, wrapperRef }) {
  controlDialogTitle.textContent = title || t('controlDialog.title');
  controlDialogSubtitle.textContent = wrapperRef || '';
  controlDialogTarget.textContent = targetLabel || controlTargetId;
  controlDialogLog.textContent = '';
  appendControlLog((currentLanguage === 'zhTw' ? '目標: ' : 'Target: ') + (targetLabel || controlTargetId));
  appendControlLog((currentLanguage === 'zhTw' ? '動作: ' : 'Action: ') + action);
  setControlDialogMode('preparing');
  controlDialog.hidden = false;
  document.body.classList.add('modal-open');
  controlDialogOk.focus();
}
function setControlDialogMode(mode) {
  const labelKey = {
    preparing: 'preparing',
    confirm: 'preparing',
    running: 'running',
    completed: 'completed',
    failed: 'failed',
    canceled: 'canceled'
  }[mode] || 'preparing';
  const classKey = {
    preparing: 'checking',
    confirm: 'review_required',
    running: 'checking',
    completed: 'ready',
    failed: 'error',
    canceled: 'disabled'
  }[mode] || 'checking';
  controlDialogState.className = 'pill ' + classKey;
  controlDialogState.textContent = t('controlDialog.' + labelKey);
  controlDialogConfirm.hidden = mode !== 'confirm';
  controlDialogCancel.hidden = mode !== 'confirm';
  controlDialogOk.hidden = mode === 'confirm' || mode === 'running';
  if (mode === 'confirm') controlDialogConfirm.focus();
}
function appendControlLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  controlDialogLog.textContent += '[' + timestamp + '] ' + message + '\\n';
  controlDialogLog.scrollTop = controlDialogLog.scrollHeight;
}
function closeControlDialog() {
  controlDialog.hidden = true;
  document.body.classList.remove('modal-open');
  if (controlDialogConfirmResolver) {
    controlDialogConfirmResolver(false);
    controlDialogConfirmResolver = null;
  }
}
function waitForControlDialogConfirmation() {
  return new Promise((resolve) => {
    controlDialogConfirmResolver = (value) => {
      controlDialogConfirmResolver = null;
      resolve(value);
    };
  });
}
controlDialogConfirm.addEventListener('click', () => {
  if (controlDialogConfirmResolver) controlDialogConfirmResolver(true);
});
controlDialogCancel.addEventListener('click', () => {
  if (controlDialogConfirmResolver) controlDialogConfirmResolver(false);
});
controlDialogClose.addEventListener('click', closeControlDialog);
controlDialogOk.addEventListener('click', closeControlDialog);
controlDialog.addEventListener('click', (event) => {
  if (event.target === controlDialog && controlDialogOk.hidden === false) closeControlDialog();
});
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !controlDialog.hidden && controlDialogOk.hidden === false) closeControlDialog();
});
function pill(value) {
  return '<span class="pill ' + esc(String(value).toLowerCase()) + '">' + esc(value) + '</span>';
}
function linkedPill(value, ref, label) {
  const target = localFileTarget(ref) || registryReferenceTarget(label, ref);
  if (!target) return pill(value);
  return '<a class="pill pill-link ' + esc(String(value).toLowerCase()) + '" href="' + esc(target.href) + '" target="_blank" rel="noreferrer" title="' + esc(target.text) + '" aria-label="' + esc(label + ' reference: ' + target.text) + '">' + esc(value) + '</a>';
}
function registryReferenceTarget(label, ref) {
  if (label !== 'Restart' || !ref) return null;
  return {
    href: '/file?path=registry%2Fstartup.registry.json',
    text: String(ref)
  };
}
function match(row, query) {
  return !query || JSON.stringify(row).toLowerCase().includes(query);
}
function textCell(value) {
  return esc(value);
}
function linkify(value) {
  const escaped = esc(value);
  return escaped.replace(/(https?:\\/\\/[^\\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
}
function intenalLink(value) {
  return '<a href="' + esc(value) + '" target="_blank" rel="noreferrer"><code>' + esc(value) + '</code></a>';
}
function fileRef(value) {
  const linked = fileRefLink('', value);
  if (linked) return linked;
  return '<code>' + esc(String(value ?? '')) + '</code>';
}
function fileRefWithCompanion(value) {
  const primary = fileRef(value);
  const companion = companionFileRef(value);
  if (!companion) return primary;
  return '<span class="file-ref-stack">' + primary + companion + '</span>';
}
function companionFileRef(value) {
  const pathPart = localFilePathPart(value);
  const companion = state.localFileCompanions?.[pathPart];
  if (!companion) return '';
  const target = localFileTarget(companion);
  if (!target) return '';
  return '<a class="file-ref-companion" href="' + esc(target.href) + '" target="_blank" rel="noreferrer"><code>' + esc(t('labels.zhTwCompanion') + ': ' + target.text) + '</code></a>';
}
function fileRefLink(label, value) {
  const target = localFileTarget(value);
  if (target) {
    const text = label ? label + ': ' + target.text : target.text;
    return '<a href="' + esc(target.href) + '" target="_blank" rel="noreferrer"><code>' + esc(text) + '</code></a>';
  }
  return label ? '<code>' + esc(label + ': ' + String(value ?? '')) + '</code>' : '';
}
function localFileTarget(value) {
  const text = String(value ?? '');
  const pathPart = localFilePathPart(text);
  if (/^(?:AGENTS|README)\\.zh-tw\\.md$|^(?:AGENTS|README)\\.md$|^package\\.json$|^(?:registry|scripts|templates|docs|reports)\\/[A-Za-z0-9._\\/-]+\\.(?:md|json|txt|yml|yaml|mjs|ps1|html)$/.test(pathPart)) {
    return {
      href: '/file?path=' + encodeURIComponent(pathPart),
      text
    };
  }
  return null;
}
function localFilePathPart(value) {
  const text = String(value ?? '');
  let pathPart = text.split('#')[0];
  if (pathPart.startsWith('devgov/')) pathPart = pathPart.slice('devgov/'.length);
  return pathPart;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}
function t(path) {
  const parts = path.split('.');
  let value = messages[currentLanguage];
  for (const part of parts) value = value?.[part];
  if (value !== undefined) return value;
  value = messages.en;
  for (const part of parts) value = value?.[part];
  return value ?? path;
}
function tEsc(path) {
  return esc(t(path));
}
function syncI18n() {
  const language = messages[currentLanguage].language;
  document.documentElement.lang = language.htmlLang;
  languageButton.textContent = language.switchLabel;
  languageButton.setAttribute('aria-pressed', language.ariaPressed);
  document.querySelector('nav')?.setAttribute('aria-label', currentLanguage === 'zhTw' ? '儀表板檢視' : 'Dashboard views');
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const placeholders = messages[currentLanguage].placeholders;
  for (const [name, text] of Object.entries({
    ports: placeholders.ports,
    'registered-projects': placeholders.registeredProjects,
    agents: placeholders.agents,
    startup: placeholders.startup,
    routes: placeholders.routes,
    terminal: placeholders.terminal,
    'api-keys': placeholders.apiKeys,
    'agent-instructions': placeholders.agentInstructions,
    'web-entrypoints': placeholders.webEntrypoints,
    'service-status': placeholders.serviceStatus,
    'service-onboarding': placeholders.serviceOnboarding,
    'web-console-events': placeholders.webConsoleEvents
  })) {
    const input = document.querySelector('input[data-filter="' + name + '"]');
    if (input) input.placeholder = text;
  }
  if (workspacePredictorInput) {
    workspacePredictorInput.placeholder = placeholders.workspacePredictor;
    workspacePredictorInput.setAttribute('aria-label', t('sections.workspacePredictor'));
  }
  if (workspacePredictorRulesMode) {
    workspacePredictorRulesMode.textContent = t(workspacePredictionRulesMode === 'full'
      ? 'workspacePredictor.ruleList.showCompact'
      : 'workspacePredictor.ruleList.showFull');
    workspacePredictorRulesMode.setAttribute('data-rules-mode', workspacePredictionRulesMode);
  }
  syncThemeButton();
}
function syncThemeButton() {
  const effective = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  themeButton.setAttribute('aria-pressed', String(effective === 'dark'));
  themeButton.textContent = effective === 'dark' ? t('theme.light') : t('theme.dark');
}
const Motion = {
  defaults: {
    duration: 320,
    easing: 'cubic-bezier(.2,.8,.2,1)',
    fill: 'backwards'
  },
  active: [],
  enabled() {
    return !motionQuery.matches && 'animate' in Element.prototype;
  },
  track(animation) {
    if (!animation) return animation;
    this.active.push(animation);
    animation.addEventListener('finish', () => {
      this.active = this.active.filter((item) => item !== animation);
    }, { once: true });
    animation.addEventListener('cancel', () => {
      this.active = this.active.filter((item) => item !== animation);
    }, { once: true });
    return animation;
  },
  cancel(scope) {
    const animations = scope ? scope.getAnimations({ subtree: true }) : this.active;
    animations.forEach((animation) => animation.cancel());
    if (!scope) this.active = [];
  },
  animate(target, frames, options = {}) {
    if (!this.enabled() || !target) return null;
    return this.track(target.animate(frames, { ...this.defaults, ...options }));
  },
  stagger(targets, frames, options = {}) {
    if (!this.enabled()) return;
    const { delay = 0, maxStaggerIndex = 12, stagger = 24, ...animationOptions } = options;
    [...targets].forEach((target, index) => {
      this.animate(target, frames, {
        ...animationOptions,
        delay: delay + Math.min(index, maxStaggerIndex) * stagger
      });
    });
  },
  timeline(steps) {
    if (!this.enabled()) return;
    let cursor = 0;
    for (const step of steps) {
      const at = step.at ?? cursor;
      this.stagger(step.targets, step.frames, {
        duration: step.duration,
        easing: step.easing,
        fill: step.fill,
        maxStaggerIndex: step.maxStaggerIndex,
        stagger: step.stagger,
        delay: at
      });
      cursor = Math.max(cursor, at + (step.duration ?? this.defaults.duration));
    }
  },
  intro() {
    if (!this.enabled()) return;
    this.timeline([
      {
        targets: document.querySelectorAll('header, nav, section.active'),
        stagger: 70,
        duration: 420,
        frames: [
          { opacity: 0, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ]
      }
    ]);
  },
  deck(cards) {
    if (!this.enabled() || !document.body.classList.contains('deck-mode')) return;
    this.stagger(cards, [
      { opacity: 0, transform: 'translate(var(--card-x), calc(var(--card-y) + 22px)) rotate(calc(var(--card-rotate) - 3deg)) scale(.96)' },
      { opacity: 1, transform: 'translate(var(--card-x), var(--card-y)) rotate(var(--card-rotate)) scale(1)' }
    ], {
      duration: 420,
      stagger: 48,
      maxStaggerIndex: 8
    });
  },
  metrics() {
    if (!this.enabled()) return;
    this.stagger(document.querySelectorAll('.metric'), [
      { opacity: 0, transform: 'translateY(14px) scale(.985)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], {
      duration: 320,
      stagger: 26
    });
  },
  rows(name) {
    if (!this.enabled()) return;
    const table = document.querySelector('[data-table="' + name + '"]');
    const active = table?.closest('section')?.classList.contains('active');
    if (!active) return;
    this.cancel(table);
    this.stagger(table.querySelectorAll('tr'), [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 220,
      stagger: 18
    });
  },
  switchView(view, button) {
    if (!this.enabled()) return;
    this.cancel(view);
    this.animate(button, [
      { transform: 'translateX(0)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(0)' }
    ], {
      duration: 260
    });
    this.animate(view, [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 280
    });
    const table = view?.querySelector('table[data-table]');
    if (table) this.rows(table.dataset.table);
  }
};
renderAll();
const initialView = viewFromLocation();
if (initialView) {
  activateView(initialView, { enterDashboard: true });
} else {
  Motion.intro();
}
refreshServiceStatus();
refreshServiceOnboarding();
refreshWebConsoleEvents();
onboardingButton.addEventListener('click', () => refreshServiceOnboarding());
reportWebConsoleEvent('dashboard-open', {
  path: location.pathname + location.hash,
  title: document.title,
  source: 'inline-dashboard'
});
</script>
</body>
</html>`;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}
async function readDashboardEvents(filePath) {
  const raw = await fs.readFile(filePath, "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const events = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.events) ? parsed.events : [];
    return events;
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
}

function checkUrl(url, timeoutMs, quickTest = {}) {
  if (!url) {
    return Promise.resolve({
      state: "MISSING",
      statusCode: null,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      error: "No health URL registered"
    });
  }
  return new Promise((resolveStatus) => {
    let resolved = false;
    const started = Date.now();
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const acceptedStatusCodes = Array.isArray(quickTest.acceptedStatusCodes)
      ? new Set(quickTest.acceptedStatusCodes)
      : null;
    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      response.on("end", () => {
        if (resolved) return;
        resolved = true;
        const online = acceptedStatusCodes
          ? acceptedStatusCodes.has(response.statusCode)
          : response.statusCode >= 200 && response.statusCode < 400;
        resolveStatus({
          state: online ? "ONLINE" : "ERROR",
          statusCode: response.statusCode,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString()
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => {
      if (resolved) return;
      resolved = true;
      resolveStatus({
        state: error.message === "timeout" || ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(error.code) ? "OFFLINE" : "ERROR",
        error: error.message,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      });
    });
  });
}

function checkLocalProbe(root, quickTest = {}, timeoutMs) {
  const probeRef = String(quickTest.probeRef || "").trim();
  if (!probeRef) {
    return Promise.resolve({
      state: "MISSING",
      statusCode: null,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      error: "No local quick probe registered"
    });
  }

  return new Promise((resolveStatus) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";
    const started = Date.now();
    const effectiveTimeoutMs = Math.max(1000, (quickTest.timeoutSeconds ?? Math.ceil(timeoutMs / 1000)) * 1000);
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", path.join(root, probeRef)
    ], {
      cwd: root,
      windowsHide: true
    });

    const timer = setTimeout(() => {
      child.kill();
      if (resolved) return;
      resolved = true;
      resolveStatus({
        state: "OFFLINE",
        error: "timeout",
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      });
    }, effectiveTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      resolveStatus({
        state: "ERROR",
        error: error.message,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      try {
        const parsed = JSON.parse(stdout.trim());
        resolveStatus({
          state: code === 0 && parsed.ok ? "ONLINE" : "ERROR",
          error: code === 0 ? undefined : String(parsed.summary ?? stderr.trim() ?? stdout.trim() ?? `Probe exited with code ${code}`),
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString()
        });
      } catch {
        resolveStatus({
          state: code === 0 ? "ONLINE" : "ERROR",
          error: code === 0 ? undefined : (stderr.trim() || stdout.trim() || `Probe exited with code ${code}`),
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString()
        });
      }
    });
  });
}
