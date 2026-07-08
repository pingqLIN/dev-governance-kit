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
  const storageRecords = buildStorageRecords({
    onboardingEntries: serviceOnboarding.entries,
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
      storageRecords: storageRecords.length,
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
    onboardingEntries: serviceOnboarding.entries,
    serviceControl: {
      baseUrl: SERVICE_CONTROL_URL,
      entries: serviceControls
    },
    workspacePrediction,
    registeredProjects,
    storageRecords,
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

export function buildStorageRecords({ onboardingEntries = [], serviceTargets = [] } = {}) {
  const records = [];
  const chromeAiModelStore = onboardingEntries.find((entry) => entry.id === "chrome-ai-model-store-filesystem");
  const chromeAiTarget = serviceTargets.find((target) => target.controlTargetId === "chrome-ai-model-store");
  if (chromeAiModelStore || chromeAiTarget) {
    records.push({
      id: "chrome-ai-model-store",
      label: "Chrome AI Model Store",
      project: chromeAiModelStore?.project ?? chromeAiTarget?.project ?? "chrome-ai-model-store",
      storageKind: "browser-model-cache",
      modelStore: "OptGuideOnDeviceModel",
      primaryOwner: "Stable Chrome",
      sharedWith: ["Chrome Beta", "Chrome Dev", "Chrome Canary when installed"],
      physicalPolicy: "One Stable-owned model store; installed secondary channels reuse model bytes through filesystem links.",
      serviceTargetId: chromeAiTarget?.id ?? "",
      controlTargetId: "chrome-ai-model-store",
      doctorRef: chromeAiTarget?.doctor?.ref ?? "scripts/service-control/doctor-chrome-ai-model-store.ps1",
      resetRef: chromeAiTarget?.restart?.ref ?? "scripts/service-control/restart-chrome-ai-model-store.ps1",
      docsRef: "docs/service-onboarding/chrome-ai-model-store.md",
      readiness: chromeAiModelStore?.readiness ?? chromeAiTarget?.controlReadiness ?? "PARTIAL",
      reviewStatus: chromeAiModelStore?.reviewStatus ?? "reviewed",
      notes: chromeAiModelStore?.notes ?? "Chrome built-in AI model cache sharing governance."
    });
  }
  return records;
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
  if (agent.id === "codex-calendar-todo-agent-ops") return "codex-calendar-todo-staging";
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
      --sticky-header-offset: 176px;
      --font-sans: "Bahnschrift", "Microsoft JhengHei", sans-serif;
      --font-mono: "Cascadia Mono", monospace;
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
    * {
      box-sizing: border-box;
      letter-spacing: 0;
    }
    [hidden] {
      display: none !important;
    }
    body {
      margin: 0;
      background:
        linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
        linear-gradient(0deg, var(--grid-line) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font-family: var(--font-sans);
      font-size: 15px;
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
      font-family: var(--font-sans);
      font-size: clamp(33px, 5vw, 65px);
      font-weight: 800;
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
      font-size: 13px;
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
    .execution-status {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: 8px 14px;
      grid-template-columns: minmax(0, 1fr) minmax(160px, 28%);
      margin: 14px auto 0;
      max-width: 1360px;
      padding: 10px 12px;
    }
    .execution-status-main {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
    .execution-status-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .execution-status-name {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .execution-status-detail {
      align-items: center;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      font-size: 11px;
      gap: 8px;
      grid-column: 1 / -1;
      min-width: 0;
    }
    .execution-status-detail span:first-child {
      overflow-wrap: anywhere;
    }
    .execution-status-time {
      color: var(--ink);
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .execution-progress {
      align-self: center;
      background: var(--paper);
      border: 1px solid var(--ink);
      height: 12px;
      overflow: hidden;
      width: 100%;
    }
    .execution-progress span {
      background: var(--accent);
      display: block;
      height: 100%;
      width: 0;
    }
    .execution-status[data-state="idle"] .execution-progress span,
    .execution-status[data-state="queued"] .execution-progress span {
      background: var(--neutral-bg);
    }
    .execution-status[data-state="completed"] .execution-progress span {
      background: var(--green);
    }
    .execution-status[data-state="failed"] .execution-progress span {
      background: var(--bad-bg);
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
      top: var(--sticky-header-offset);
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-family: var(--font-sans);
      font-size: 35px;
      font-weight: 800;
      line-height: 1;
    }
    body.deck-mode .metric strong {
      font-size: clamp(53px, 7vw, 95px);
      line-height: .88;
    }
    .metric span, .muted {
      color: var(--muted);
      font-size: 12px;
    }
    body.deck-mode .metric span {
      display: block;
      font-size: clamp(17px, 2vw, 25px);
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
      gap: 14px;
    }
    .prediction-stage {
      --prediction-step-column: clamp(260px, 27vw, 306px);
      --prediction-stage-columns: var(--prediction-step-column) minmax(0, 1fr);
      align-items: start;
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: clamp(12px, 2vw, 18px);
      grid-template-columns: var(--prediction-stage-columns);
      padding: 12px;
    }
    .prediction-stage--intake,
    .prediction-stage--outcome {
      --prediction-stage-columns: var(--prediction-step-column) minmax(0, 1fr);
    }
    .prediction-stage > .prediction-step {
      justify-self: stretch;
      min-height: 0;
      width: 100%;
    }
    .prediction-stage-body {
      align-self: start;
      display: grid;
      gap: 10px;
      min-width: 0;
    }
    .prediction-step {
      align-items: start;
      display: grid;
      column-gap: 12px;
      grid-template-columns: 44px minmax(0, 1fr);
      min-width: 0;
    }
    .prediction-step-index {
      align-items: center;
      background: var(--ink);
      color: var(--paper);
      display: inline-flex;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      height: 36px;
      justify-content: center;
      justify-self: start;
      line-height: 1;
      width: 36px;
    }
    .prediction-step-copy {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .prediction-step-copy strong {
      line-height: 1.2;
    }
    .prediction-step-copy span {
      color: var(--muted);
      line-height: 1.35;
    }
    .prediction-summary {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr;
      min-width: 0;
    }
    .prediction-headline {
      display: grid;
      gap: 8px;
    }
    .prediction-headline strong {
      font-size: 22px;
      line-height: 1.08;
    }
    .prediction-state-row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .prediction-facts {
      display: grid;
      gap: 6px;
      grid-template-columns: 1fr;
    }
    .prediction-facts .guidance-row {
      grid-template-columns: 140px minmax(0, 1fr);
    }
    .prediction-facts span {
      overflow-wrap: anywhere;
    }
    .prediction-tabs-row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
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
    .prediction-tab-action {
      margin-left: auto;
    }
    .prediction-panel {
      display: grid;
      gap: 12px;
      min-width: 0;
    }
    .prediction-tab-section {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: block;
      min-width: 0;
    }
    .prediction-tab-section + .prediction-tab-section {
      margin-top: 10px;
    }
    .prediction-tab-section-body {
      display: grid;
      gap: 10px;
      padding: 10px;
    }
    .prediction-tab-intro {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: 5px;
      padding: 12px;
    }
    .prediction-tab-intro span {
      color: var(--muted);
      line-height: 1.35;
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
      font-size: 15px;
      line-height: 1.2;
      margin: 0;
    }
    .prediction-rule-summary {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: block;
    }
    .prediction-rule-summary-body {
      display: grid;
      gap: 10px;
      padding: 10px;
    }
    .prediction-rule-summary-body p {
      margin: 0;
      opacity: 0.8;
    }
    .prediction-rule-layer {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: block;
    }
    .prediction-rule-layer + .prediction-rule-layer {
      margin-top: 8px;
    }
    .prediction-tab-section > summary,
    .prediction-rule-summary > summary,
    .prediction-rule-layer > summary,
    .prediction-rule-group > summary,
    .prediction-rule-item > summary {
      cursor: pointer;
      list-style: none;
    }
    .prediction-tab-section > summary::-webkit-details-marker,
    .prediction-rule-summary > summary::-webkit-details-marker,
    .prediction-rule-layer > summary::-webkit-details-marker,
    .prediction-rule-group > summary::-webkit-details-marker,
    .prediction-rule-item > summary::-webkit-details-marker {
      display: none;
    }
    .prediction-tab-section > summary::after,
    .prediction-rule-summary > summary::after,
    .prediction-rule-layer > summary::after,
    .prediction-rule-group > summary::after,
    .prediction-rule-item > summary::after {
      align-items: center;
      background: var(--ink);
      color: var(--paper);
      content: "+";
      display: inline-flex;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      height: 24px;
      justify-content: center;
      line-height: 1;
      width: 24px;
    }
    .prediction-tab-section[open] > summary::after,
    .prediction-rule-summary[open] > summary::after,
    .prediction-rule-layer[open] > summary::after,
    .prediction-rule-group[open] > summary::after,
    .prediction-rule-item[open] > summary::after {
      content: "-";
    }
    .prediction-tab-section > summary,
    .prediction-rule-summary > summary,
    .prediction-rule-layer > summary,
    .prediction-rule-group > summary,
    .prediction-rule-item > summary {
      align-items: start;
      display: grid;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 10px;
    }
    .prediction-tab-section[open] > summary,
    .prediction-rule-summary[open] > summary,
    .prediction-rule-layer[open] > summary,
    .prediction-rule-group[open] > summary,
    .prediction-rule-item[open] > summary {
      border-bottom: 1px solid var(--ink);
    }
    .prediction-rule-summary-copy {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .prediction-rule-summary-copy strong,
    .prediction-rule-id {
      overflow-wrap: anywhere;
    }
    .prediction-rule-summary-copy span {
      color: var(--muted);
      font-size: 0.9em;
    }
    .prediction-rule-layer-body {
      display: grid;
      gap: 8px;
      padding: 10px;
    }
    .prediction-rule-group {
      background: var(--paper);
      border: 2px solid var(--ink);
      display: block;
    }
    .prediction-rule-list {
      display: grid;
    }
    .prediction-rule-item {
      border-top: 1px solid var(--line);
      display: block;
    }
    .prediction-rule-item:first-child {
      border-top: 0;
    }
    .prediction-rule-item > summary {
      align-items: center;
      grid-template-columns: minmax(0, 1fr) auto auto;
    }
    .prediction-rule-id {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
    }
    .prediction-rule-details {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 10px;
    }
    .prediction-rule-detail-row {
      display: grid;
      gap: 6px;
      grid-template-columns: minmax(96px, 0.26fr) minmax(0, 1fr);
    }
    .prediction-rule-detail-row dt {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      margin: 0;
    }
    .prediction-rule-detail-row dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
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
    .storage-asset-list {
      display: grid;
      gap: 14px;
      min-width: 0;
    }
    .storage-asset {
      background: color-mix(in oklab, var(--panel) 88%, var(--accent) 12%);
      border: 2px solid var(--ink);
      display: grid;
      min-width: 0;
      transform-origin: top center;
    }
    .storage-asset-head {
      align-items: start;
      border-bottom: 1px solid var(--ink);
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(210px, .75fr) minmax(0, 1.35fr) auto;
      padding: 12px;
    }
    .storage-asset-identity {
      display: grid;
      gap: 5px;
      min-width: 0;
    }
    .storage-asset-kicker, .storage-panel-title {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      line-height: 1.25;
      text-transform: uppercase;
    }
    .storage-asset-title {
      font-size: 17px;
      font-weight: 800;
      line-height: 1.18;
      overflow-wrap: anywhere;
    }
    .storage-asset-summary {
      color: var(--muted);
      line-height: 1.45;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .storage-badge-row {
      align-items: start;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
    }
    .storage-asset-body {
      display: grid;
      grid-template-columns: minmax(190px, .85fr) minmax(310px, 1.35fr) minmax(220px, .9fr);
      min-width: 0;
    }
    .storage-panel {
      align-content: start;
      border-right: 1px solid var(--line);
      display: grid;
      gap: 9px;
      min-width: 0;
      padding: 12px;
    }
    .storage-live-panel {
      background: color-mix(in oklab, var(--panel-raised) 46%, transparent);
    }
    .storage-operations-column {
      display: grid;
      grid-template-rows: auto auto;
      min-width: 0;
    }
    .storage-operations-column .storage-panel {
      border-bottom: 1px solid var(--line);
      border-right: 0;
    }
    .storage-operations-column .storage-panel:last-child {
      border-bottom: 0;
    }
    .storage-detail-cell, .storage-policy-cell, .storage-control-cell {
      min-width: 0;
    }
    .storage-info-grid {
      display: grid;
      gap: 4px;
      grid-template-columns: minmax(0, 1fr);
      margin: 0;
    }
    .storage-info-grid dt {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      line-height: 1.35;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .storage-info-grid dt:first-child {
      margin-top: 0;
    }
    .storage-info-grid dd {
      line-height: 1.35;
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .storage-path code {
      display: inline;
      overflow-wrap: anywhere;
      white-space: normal;
      word-break: break-word;
    }
    .storage-note-list {
      display: grid;
      gap: 4px;
    }
    .storage-channel-list {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      min-width: 0;
    }
    .storage-channel {
      background: color-mix(in oklab, var(--panel) 70%, transparent);
      border: 1px solid var(--line);
      display: grid;
      gap: 5px;
      min-width: 0;
      padding: 8px;
    }
    .storage-channel-head {
      align-items: start;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: space-between;
      min-width: 0;
    }
    .storage-channel-head strong, .storage-channel-detail {
      overflow-wrap: anywhere;
    }
    .storage-channel-detail {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }
    .storage-control-cell {
      display: grid;
      gap: 8px;
    }
    .storage-control-cell .check-grid, .storage-control-actions {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .storage-control-cell .check-row {
      grid-template-columns: minmax(64px, .8fr) auto;
    }
    .storage-control-cell .check-detail {
      grid-column: 1 / -1;
    }
    .storage-empty {
      background: var(--panel);
      border: 2px solid var(--ink);
      color: var(--muted);
      padding: 14px;
    }
    .storage-asset code, .glyph, .execution-status-time {
      font-family: var(--font-mono);
      min-width: 0;
    }
    table[data-table="registered-projects"] {
      table-layout: fixed;
    }
    table[data-table="registered-projects"] th:nth-child(1) { width: 18%; }
    table[data-table="registered-projects"] th:nth-child(2) { width: 17%; }
    table[data-table="registered-projects"] th:nth-child(4) { width: 17%; }
    table[data-table="registered-projects"] th:nth-child(5) { width: 27%; }
    table[data-table="registered-projects"] th:nth-child(6) { width: 10%; }
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
    .project-tag-list {
      align-content: start;
      gap: 5px;
    }
    .project-tag {
      line-height: 1.2;
      max-width: 116px;
      overflow-wrap: anywhere;
      padding: 2px 6px;
      white-space: normal;
    }
    .project-services-cell span, .next-action-cell span {
      overflow-wrap: anywhere;
    }
    .next-action-cell span {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4;
      overflow: hidden;
    }
    .source-link-list {
      align-items: flex-start;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-width: 100%;
      max-height: 44px;
      overflow: hidden;
    }
    .source-chip, .source-more {
      max-width: 100%;
      white-space: nowrap;
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
      font-size: 11px;
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
      font-size: 11px;
      text-transform: uppercase;
    }
    td {
      overflow-wrap: anywhere;
    }
    code {
      color: var(--blue);
      font-family: var(--font-mono);
      font-size: 12px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 12px;
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
      font-size: clamp(21px, 3vw, 33px);
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
      font: 12px/1.45 var(--font-mono);
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
      .execution-progress span {
        transition: width 180ms ease-out, background-color 180ms ease-out;
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
      font-size: 11px;
      margin-top: 2px;
    }
    @media (max-width: 820px) {
      .mast, main { grid-template-columns: 1fr; }
      .header-actions { justify-items: start; min-width: 0; }
      .header-buttons { justify-content: flex-start; }
      .execution-status { grid-template-columns: 1fr; }
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
        font-size: clamp(41px, 9vw, 61px);
      }
      body.deck-mode .metric span {
        font-size: clamp(14px, 3.4vw, 19px);
        margin-top: 8px;
      }
      body.deck-mode .metric::after {
        bottom: 10px;
        left: clamp(14px, 3.5vw, 20px);
      }
      .status { justify-content: start; }
      .toolbar { align-items: stretch; flex-direction: column; }
      .guidance-row { grid-template-columns: 1fr; }
      .prediction-stage {
        --prediction-stage-columns: 1fr;
      }
      .prediction-stage--intake {
        margin-bottom: 0;
      }
      .prediction-stage--intake > .prediction-step,
      .prediction-stage--outcome > .prediction-step {
        margin-left: 0;
        min-height: 0;
        width: 100%;
      }
      .prediction-tabs-row {
        align-items: stretch;
        flex-direction: column;
      }
      .prediction-tab-action {
        margin-left: 0;
      }
      .prediction-facts { grid-template-columns: 1fr; }
      .prediction-facts .guidance-row { grid-template-columns: 1fr; }
      .predictor-actions { justify-content: flex-start; min-width: 0; }
      .prediction-rule-detail-row {
        grid-template-columns: 1fr;
      }
      .storage-asset-head, .storage-asset-body {
        grid-template-columns: 1fr;
      }
      .storage-badge-row {
        justify-content: flex-start;
      }
      .storage-panel, .storage-live-panel {
        border-bottom: 1px solid var(--line);
        border-right: 0;
      }
      .storage-operations-column .storage-panel:last-child {
        border-bottom: 0;
      }
      table {
        display: block;
        font-size: 13px;
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
        font-size: clamp(33px, 11vw, 47px);
      }
      body.deck-mode .metric span {
        font-size: clamp(12px, 3.9vw, 15px);
        line-height: 1.15;
        margin-top: 6px;
      }
      body.deck-mode .metric::after {
        bottom: 8px;
        font-size: 10px;
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
      <div class="muted" data-i18n="subtitle">本機治理主控台：集中檢查連接埠（ports）、登入啟動、公開路由與工作區就緒狀態。</div>
    </div>
    <div class="header-actions">
      <div class="header-buttons">
        <button class="language-toggle" type="button" id="language-toggle" aria-pressed="true">English</button>
        <button class="theme-toggle" type="button" id="theme-toggle" aria-pressed="false">深色模式</button>
      </div>
      <div class="status"><span class="status-lamp" aria-hidden="true"><span class="status-lamp-core"></span></span><span>${escapeHtml(state.app.url)}</span></div>
    </div>
  </div>
  <div class="execution-status" id="execution-status" data-state="idle" aria-live="polite" aria-atomic="false">
    <div class="execution-status-main">
      <span class="execution-status-label" data-i18n="executionStatus.title">執行狀態</span>
      <span class="pill checking" id="execution-status-state">閒置</span>
      <span class="execution-status-name" id="execution-status-name">沒有進行中的任務</span>
    </div>
    <div class="execution-progress" aria-hidden="true"><span id="execution-status-progress"></span></div>
    <div class="execution-status-detail">
      <span id="execution-status-detail">等待儀表板操作。</span>
      <span class="execution-status-time" id="execution-status-time"></span>
    </div>
  </div>
</header>
<main>
  <nav aria-label="儀表板檢視">
    <button data-view="overview" aria-selected="true"><span class="glyph">01</span> <span data-i18n="nav.overview">總覽</span></button>
    <button data-view="ports"><span class="glyph">02</span> <span data-i18n="nav.ports">連接埠</span></button>
    <button data-view="registered-projects"><span class="glyph">03</span> <span data-i18n="nav.registeredProjects">本機登記專案</span></button>
    <button data-view="agents"><span class="glyph">04</span> <span data-i18n="nav.agents">本機代理</span></button>
    <button data-view="startup"><span class="glyph">05</span> <span data-i18n="nav.startup">啟動治理</span></button>
    <button data-view="routes"><span class="glyph">06</span> <span data-i18n="nav.routes">公開路由</span></button>
    <button data-view="terminal"><span class="glyph">07</span> <span data-i18n="nav.terminal">終端機設定</span></button>
    <button data-view="api-keys"><span class="glyph">08</span> <span data-i18n="nav.apiKeys">API 金鑰治理</span></button>
    <button data-view="storage-assets"><span class="glyph">09</span> <span data-i18n="nav.storageAssets">儲存治理</span></button>
    <button data-view="agent-instructions"><span class="glyph">10</span> <span data-i18n="nav.agentInstructions">Agent 指令</span></button>
    <button data-view="workspace-predictor"><span class="glyph">11</span> <span data-i18n="nav.workspacePredictor">工作區預測</span></button>
    <button data-view="web-entrypoints"><span class="glyph">12</span> <span data-i18n="nav.webEntrypoints">Web 入口</span></button>
    <button data-view="service-status"><span class="glyph">13</span> <span data-i18n="nav.serviceStatus">服務狀態</span></button>
    <button data-view="service-onboarding"><span class="glyph">14</span> <span data-i18n="nav.serviceOnboarding">補充程序</span></button>
    <button data-view="web-console-events"><span class="glyph">15</span> <span data-i18n="nav.webConsoleEvents">網頁事件</span></button>
  </nav>
  <div>
    <section id="overview" class="active">
      <div class="strip" id="metrics"></div>
      <table id="dashboard-port"></table>
    </section>
    <section id="ports" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.ports">連接埠登記</h2><input data-filter="ports" placeholder="篩選連接埠"></div>
      <table data-table="ports"></table>
    </section>
    <section id="registered-projects" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.registeredProjects">本機登記專案</h2><input data-filter="registered-projects" placeholder="篩選本機登記專案"></div>
      <div class="guidance">
        <div><strong data-i18n="registeredProjects.label">進度標記：</strong> <span data-i18n="registeredProjects.body">專案進度由已登錄資料彙整：就緒狀態、審查狀態、可見範圍、服務覆蓋與下一步。</span></div>
      </div>
      <table data-table="registered-projects"></table>
    </section>
    <section id="agents" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.agents">本機服務代理</h2><input data-filter="agents" placeholder="篩選本機代理"></div>
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
      <div class="toolbar"><h2 data-i18n="sections.terminal">終端機設定檔</h2><input data-filter="terminal" placeholder="篩選終端機設定"></div>
      <table data-table="terminal"></table>
    </section>
    <section id="api-keys" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.apiKeys">API 金鑰治理</h2><input data-filter="api-keys" placeholder="篩選 API 金鑰"></div>
      <table data-table="api-keys"></table>
    </section>
    <section id="storage-assets" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.storageAssets">儲存治理</h2><input data-filter="storage-assets" placeholder="篩選儲存資產"></div>
      <div class="guidance">
        <div><strong data-i18n="storageAssets.label">儲存政策：</strong> <span data-i18n="storageAssets.body">長期本機儲存資產會在這裡列出政策、即時占用、通道共享狀態，以及已審核的 Doctor[診斷] 或 Reset[重設] 控制。</span></div>
      </div>
      <div data-table="storage-assets" class="storage-asset-list"></div>
    </section>
    <section id="agent-instructions" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.agentInstructions">Agent 指令</h2><input data-filter="agent-instructions" placeholder="篩選 Agent 指令"></div>
      <div class="guidance" id="agent-storage-guidance"></div>
      <table data-table="agent-instructions"></table>
    </section>
    <section id="workspace-predictor" class="table-view">
      <div class="toolbar">
        <h2 data-i18n="sections.workspacePredictor">工作區規則預測</h2>
      </div>
      <div class="prediction-layout">
        <div class="prediction-stage prediction-stage--intake">
          <div class="prediction-step">
            <span class="prediction-step-index">01</span>
            <div class="prediction-step-copy">
              <strong data-i18n="workspacePredictor.steps.intakeTitle">選取工作區</strong>
              <span data-i18n="workspacePredictor.body">輸入本機工作區路徑，預先檢視代理在碰觸專案前應套用的治理層、安全門檻與驗證檢查。</span>
            </div>
          </div>
          <div class="prediction-stage-body inline-actions predictor-actions">
            <input id="workspace-predictor-path" placeholder="Q:\\\\Projects\\\\example-app" aria-label="Workspace path">
            <button class="action-button" type="button" id="workspace-predictor-run" data-i18n="workspacePredictor.run">預測</button>
            <button class="action-button" type="button" id="workspace-predictor-clear" data-i18n="workspacePredictor.clear">清除</button>
          </div>
        </div>
        <div class="prediction-stage prediction-stage--outcome">
          <div class="prediction-step">
            <span class="prediction-step-index">02</span>
            <div class="prediction-step-copy">
              <strong data-i18n="workspacePredictor.steps.outcomeTitle">閱讀結果</strong>
              <span data-i18n="workspacePredictor.steps.outcomeBody">先確認路徑分類、政策狀態與規則數量，再進入細節。</span>
            </div>
          </div>
          <div class="prediction-stage-body">
            <div class="prediction-summary" id="workspace-prediction-summary"></div>
          </div>
        </div>
        <div class="prediction-stage">
          <div class="prediction-step">
            <span class="prediction-step-index">03</span>
            <div class="prediction-step-copy">
              <strong data-i18n="workspacePredictor.steps.reviewTitle">檢視治理層與檢查</strong>
              <span data-i18n="workspacePredictor.steps.reviewBody">依序查看判定備註、生效規則與驗證命令。</span>
            </div>
          </div>
          <div class="prediction-stage-body">
            <div class="prediction-tabs-row">
              <div class="prediction-tabs" role="tablist" aria-label="Workspace prediction tabs">
                <button type="button" data-prediction-tab="summary" aria-controls="workspace-prediction-panel" aria-selected="true" data-i18n="workspacePredictor.tabs.summary">摘要</button>
                <button type="button" data-prediction-tab="rules" aria-controls="workspace-prediction-panel" aria-selected="false" data-i18n="workspacePredictor.tabs.rules">規則</button>
                <button type="button" data-prediction-tab="checks" aria-controls="workspace-prediction-panel" aria-selected="false" data-i18n="workspacePredictor.tabs.checks">檢查</button>
              </div>
              <button class="action-button prediction-tab-action" type="button" id="workspace-predictor-rules-mode" data-rules-mode="compact" data-i18n="workspacePredictor.ruleList.showFull">顯示完整規則</button>
            </div>
            <div class="prediction-panel" id="workspace-prediction-panel" role="tabpanel"></div>
          </div>
        </div>
      </div>
    </section>
    <section id="web-entrypoints" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.webEntrypoints">Web 入口</h2><input data-filter="web-entrypoints" placeholder="篩選 web 入口"></div>
      <div class="guidance">
        <div><strong data-i18n="webEntrypoints.label">TB2 入口：</strong> <span data-i18n="webEntrypoints.body">這裡列出 TB2 正式與測試環境的公開健康檢查入口，並集中放在 DevGov 儀表板視圖中。實際路由健康狀態請到「服務狀態」檢查。</span></div>
      </div>
      <table data-table="web-entrypoints"></table>
    </section>
    <section id="service-status" class="table-view">
      <div class="toolbar">
        <h2 data-i18n="sections.serviceStatus">網路服務狀態</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
          <input data-filter="service-status" placeholder="篩選服務">
        </div>
      </div>
      <div class="guidance">
        <div><strong data-i18n="restartPolicy.label">重啟政策：</strong> <span data-i18n="restartPolicy.body">「Quick Test[快速檢查]」只執行安全健康檢查，並回報 Doctor[診斷] 與 Restart[重啟] 的就緒狀態。已審查的控制會直接顯示在狀態標記上；重啟政策未完整的服務仍維持審查門檻。</span></div>
      </div>
      <table data-table="service-status"></table>
    </section>
    <section id="service-onboarding" class="table-view">
      <div class="toolbar">
        <h2 data-i18n="sections.serviceOnboarding">既有專案補件</h2>
        <div class="inline-actions">
          <button class="action-button" type="button" id="refresh-service-onboarding" data-i18n="serviceOnboarding.runAudit">執行稽核</button>
          <input data-filter="service-onboarding" placeholder="篩選補充程序">
        </div>
      </div>
      <div class="guidance">
        <div><strong data-i18n="serviceOnboarding.label">程序：</strong> <span data-i18n="serviceOnboarding.body">這份稽核會交叉比對連接埠登記、啟動登記、公開路由、本機代理與服務狀態就緒資訊，快速找出哪些已登記專案還缺 Doctor[診斷]、Quick Test[快速檢查] 或啟動補件。</span></div>
      </div>
      <table data-table="service-onboarding"></table>
    </section>
    <section id="web-console-events" class="table-view">
      <div class="toolbar"><h2 data-i18n="sections.webConsoleEvents">網頁事件</h2><input data-filter="web-console-events" placeholder="篩選事件"></div>
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
      storageAssets: 'Storage',
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
      storageAssets: 'Storage Governance',
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
      storageAssets: 'Filter storage assets',
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
      storageAssets: 'Storage',
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
    storageAssets: {
      label: 'Storage policy:',
      body: 'Long-lived local storage assets are listed here with their policy, live footprint, channel sharing state, and reviewed Doctor or Reset controls.'
    },
      workspacePredictor: {
        label: 'Prediction model:',
        body: 'Enter a local workspace path to preview which governance layers, safety gates, and verification checks an agent should expect before touching the project.',
        run: 'Predict',
        clear: 'Clear',
        steps: {
          intakeTitle: 'Select workspace',
          outcomeTitle: 'Read outcome',
          outcomeBody: 'Confirm the path class, policy state, and rule count before reviewing details.',
          reviewTitle: 'Review layers and checks',
          reviewBody: 'Move from decision notes to effective rules, then to verification commands.'
        },
        ruleList: {
          showFull: 'Show full rules',
          showCompact: 'Show compact rules',
          modeCompact: 'Compact list',
          modeFull: 'Full list',
          intro: 'Rules are grouped first by governance layer, then by item type so authority, safety, data, tools, and verification stay separated.',
          typeSummary: 'Rule type summary',
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
      checksBody: 'Run the smallest relevant verification after the expected instruction layers and safety gates are understood.',
      risksTitle: 'Decision notes',
      layersTitle: 'Layer sequence',
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
    executionStatus: {
      title: 'Execution Status',
      idle: 'idle',
      queued: 'queued',
      running: 'running',
      completed: 'completed',
      failed: 'failed',
      canceled: 'canceled',
      empty: 'No active task',
      idleDetail: 'Waiting for dashboard action.',
      tasks: {
        serviceStatus: 'Service status refresh',
        serviceOnboarding: 'Service onboarding audit',
        webConsoleEvents: 'Web events refresh',
        workspacePredictor: 'Workspace prediction',
        workspaceClear: 'Clear workspace prediction',
        serviceControl: 'Service control'
      },
      details: {
        serviceStatus: 'Checking registered service health.',
        serviceStatusDone: 'Service status refreshed.',
        serviceStatusFailed: 'Service status refresh failed.',
        serviceOnboarding: 'Refreshing onboarding audit rows.',
        serviceOnboardingDone: 'Service onboarding audit refreshed.',
        serviceOnboardingFailed: 'Service onboarding audit failed.',
        webConsoleEvents: 'Loading dashboard web event evidence.',
        webConsoleEventsDone: 'Web event evidence refreshed.',
        webConsoleEventsFailed: 'Web event evidence refresh failed.',
        workspacePredictor: 'Evaluating the selected workspace path.',
        workspacePredictorDone: 'Workspace prediction rendered.',
        workspacePredictorFailed: 'Workspace prediction failed.',
        workspaceClear: 'Cleared the local predictor input.',
        serviceControlConfirm: 'Awaiting operator confirmation.',
        serviceControlRun: 'Sending reviewed local control request.',
        serviceControlDone: 'Control request completed.',
        serviceControlFailed: 'Control request failed.',
        serviceControlCanceled: 'Canceled by operator.'
      }
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
      storageAsset: 'Storage Asset',
      currentStore: 'Current Store',
      channels: 'Channels',
      controls: 'Controls',
      primaryOwner: 'Primary Owner',
      sharedWith: 'Shared With',
      modelStore: 'Model Store',
      physicalPolicy: 'Physical Policy',
      liveSummary: 'Live Summary',
      primaryPath: 'Primary Path',
      versions: 'Versions',
      physicalSize: 'Physical Size',
      pendingLiveCheck: 'Pending live check',
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
    subtitle: '本機治理主控台：集中檢查連接埠（ports）、登入啟動、公開路由與工作區就緒狀態。',
    theme: { dark: '深色模式', light: '淺色模式' },
    nav: {
      overview: '總覽',
      ports: '連接埠',
      registeredProjects: '本機登記專案',
      agents: '本機代理',
      startup: '啟動治理',
      routes: '公開路由',
      terminal: '終端機設定',
      apiKeys: 'API 金鑰治理',
      storageAssets: '儲存治理',
      agentInstructions: 'Agent 指令',
      workspacePredictor: '工作區預測',
      webEntrypoints: 'Web 入口',
      serviceStatus: '服務狀態',
      serviceOnboarding: '補充程序',
      webConsoleEvents: '網頁事件'
    },
    sections: {
      ports: '連接埠登記',
      registeredProjects: '本機登記專案',
      agents: '本機服務代理',
      startup: '啟動治理',
      routes: '公開路由',
      terminal: '終端機設定檔',
      apiKeys: 'API 金鑰治理',
      storageAssets: '儲存治理',
      agentInstructions: 'Agent 指令',
      workspacePredictor: '工作區規則預測',
      webEntrypoints: 'Web 入口',
      serviceStatus: '網路服務狀態',
      serviceOnboarding: '既有專案補充程序',
      webConsoleEvents: '網頁事件'
    },
    placeholders: {
      ports: '篩選連接埠',
      registeredProjects: '篩選本機登記專案',
      agents: '篩選本機代理',
      startup: '篩選啟動項目',
      routes: '篩選公開路由',
      terminal: '篩選終端機設定',
      apiKeys: '篩選 API 金鑰',
      storageAssets: '篩選儲存資產',
      agentInstructions: '篩選 Agent 指令',
      workspacePredictor: 'Q:\\\\Projects\\\\example-app',
      webEntrypoints: '篩選 web 入口',
      serviceStatus: '篩選服務',
      serviceOnboarding: '篩選補充程序',
      webConsoleEvents: '篩選網頁事件'
    },
    metrics: {
      ports: '連接埠',
      registeredProjects: '專案',
      agents: '代理',
      startup: '啟動項目',
      routes: '路由',
      profiles: '設定檔',
      apiKeys: 'API 金鑰',
      storageAssets: '儲存資產',
      instructions: '指令',
      webEntrypoints: 'Web 入口',
      webConsoleEvents: '網頁事件'
    },
    webEntrypoints: {
      label: 'TB2 入口:',
      body: '這裡列出 TB2 正式與測試環境的公開健康檢查入口，並集中放在 DevGov 儀表板視圖中。實際路由健康狀態請到「服務狀態」檢查。'
    },
    restartPolicy: {
      label: '重啟政策:',
      body: '「Quick Test[快速檢查]」只執行安全健康檢查，並回報 Doctor[診斷] 與 Restart[重啟] 的就緒狀態。已審查的控制會直接顯示在狀態標記上；重啟政策未完整的服務仍維持審查門檻。'
    },
    serviceOnboarding: {
      label: '程序:',
      body: '這份稽核會交叉比對連接埠登記、啟動登記、公開路由、本機代理與服務狀態就緒資訊，快速找出哪些已登記專案還缺 Doctor[診斷]、Quick Test[快速檢查] 或啟動補件。',
      runAudit: '重跑稽核'
    },
    registeredProjects: {
      label: '進度標籤:',
      body: '專案進度由已登錄資料彙整：準備狀態、審查狀態、可見範圍、服務覆蓋與下一步。'
    },
    storageAssets: {
      label: '儲存政策:',
      body: '長期本機儲存資產會在這裡列出政策、即時占用、通道共享狀態，以及已審核的 Doctor[診斷] 或 Reset[重設] 控制。'
    },
      workspacePredictor: {
        label: '預測模型:',
        body: '輸入本機工作區路徑後，先預覽代理在動手前會受到哪些治理層、安全門檻與驗證檢查約束。',
        run: '預測',
        clear: '清除',
        steps: {
          intakeTitle: '選取工作區',
          outcomeTitle: '讀取判定',
          outcomeBody: '先確認路徑分類、政策狀態與規則數量，再進入細節。',
          reviewTitle: '檢查層級與驗證',
          reviewBody: '依序查看決策提示、生效規則，最後確認驗證命令。'
        },
        ruleList: {
          showFull: '顯示完整規則',
          showCompact: '顯示精簡規則',
          modeCompact: '精簡列表',
          modeFull: '完整列表',
          intro: '規則先依治理層分組，再依項目類型分組，讓權限、安全、資料、工具與驗證保持分離。',
          typeSummary: '規則類型摘要',
          fullHint: '切到精簡列表只顯示部份預覽。',
          compactHint: '切到完整列表可查看全部規則。'
        },
        empty: '輸入工作區路徑後即可生成預測。',
      ready: '符合治理工作區',
      review: '需要審查',
      blocked: '被工作區政策擋下',
      unresolved: '需讀取儲存庫文件後才可判定',
      detectedProject: '辨識專案',
      pathClass: '路徑分類',
      tabs: {
        summary: '摘要',
        rules: '規則',
        checks: '檢查'
      },
      summaryTitle: '代理工作前的預期治理',
      summaryBody: '這個預測只讀取已載入的 DevGov 指令分類與本機工作區規則；不掃描、不修改你輸入的路徑。',
      rulesTitle: '預測規則',
      checksTitle: '下一步檢查',
      checksBody: '理解預期指令層與安全門檻後，再執行最小且相關的驗證。',
      risksTitle: '決策提示',
      layersTitle: '治理層順序',
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
        'repo-local': '儲存庫本地 (repo-local)',
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
        repoInstructionsUnknown: '選定工作區後，仍需檢查目標儲存庫（repo）的 AGENTS.md。',
        subtreeUnknown: '較窄的資料夾覆寫規則需等檢查目標樹狀結構後才能判定。',
        loadedTaxonomy: '依已載入的 DevGov 指令分類預測。',
        projectOutsideQ: 'Q:\\\\ 之外的專案工作需要操作者明確指示。',
        outsideProjects: 'Q: 可用，但此路徑不在 Q:\\\\Projects 底下。',
        selectedRepoUnknown: '選取的儲存庫（repo）可能有本儀表板尚未載入的 AGENTS.md。',
        worktreeContainer: '此路徑符合受治理的 linked worktree[連結工作樹] 容器模式。',
        loadedPolicyPathClass: '依已載入政策與選取路徑分類預測。'
      }
    },
    controlDialog: {
      title: '服務控制',
      confirm: '執行',
      cancel: '取消',
      close: '關閉',
      preparing: '準備執行',
      running: '執行中',
      completed: '已完成',
      failed: '失敗',
      canceled: '已取消'
    },
    executionStatus: {
      title: '執行狀態',
      idle: '待命',
      queued: '等待',
      running: '執行中',
      completed: '已完成',
      failed: '失敗',
      canceled: '已取消',
      empty: '目前沒有執行項目',
      idleDetail: '等待儀表板操作。',
      tasks: {
        serviceStatus: '服務狀態刷新',
        serviceOnboarding: '補充程序稽核',
        webConsoleEvents: '網頁事件刷新',
        workspacePredictor: '工作區預測',
        workspaceClear: '清除工作區預測',
        serviceControl: '服務控制'
      },
      details: {
        serviceStatus: '檢查已登記服務的健康狀態。',
        serviceStatusDone: '服務狀態已刷新。',
        serviceStatusFailed: '服務狀態刷新失敗。',
        serviceOnboarding: '刷新補充程序稽核列。',
        serviceOnboardingDone: '補充程序稽核已刷新。',
        serviceOnboardingFailed: '補充程序稽核失敗。',
        webConsoleEvents: '載入儀表板網頁事件證據。',
        webConsoleEventsDone: '網頁事件證據已刷新。',
        webConsoleEventsFailed: '網頁事件證據刷新失敗。',
        workspacePredictor: '評估選取的工作區路徑。',
        workspacePredictorDone: '工作區預測已產生。',
        workspacePredictorFailed: '工作區預測失敗。',
        workspaceClear: '已清除本機預測輸入。',
        serviceControlConfirm: '等待操作者確認。',
        serviceControlRun: '送出已審查的本機控制請求。',
        serviceControlDone: '控制請求已完成。',
        serviceControlFailed: '控制請求失敗。',
        serviceControlCanceled: '使用者取消執行。'
      }
    },
    labels: {
      dashboard: '儀表板',
      socket: '通訊端',
      policy: '政策',
      notes: '備註',
      missingDashboard: '找不到儀表板連接埠登記',
      project: '專案',
      progress: '進度',
      service: '服務',
      services: '服務',
      visibility: '可見範圍',
      agent: '代理',
      kind: '類型',
      health: '健康檢查',
      startup: '啟動',
      status: '狀態',
      id: 'ID',
      trigger: '觸發條件',
      script: '腳本',
      purpose: '用途',
      hostname: '主機名稱',
      healthUrl: '健康檢查網址',
      localTarget: '本機目標',
      exposure: '暴露範圍',
      access: '存取',
      name: '名稱',
      assetPolicy: '資產政策',
      variable: '變數',
      storage: '儲存位置',
      storageAsset: '儲存資產',
      currentStore: '目前儲存',
      channels: '通道',
      controls: '控制',
      primaryOwner: '主要擁有者',
      sharedWith: '共用對象',
      modelStore: '模型儲存區',
      physicalPolicy: '實體政策',
      liveSummary: '即時摘要',
      primaryPath: '主要路徑',
      versions: '版本',
      physicalSize: '實體大小',
      pendingLiveCheck: '等待即時檢查',
      settings: '設定',
      type: '類型',
      layer: '治理層',
      requirement: '需求',
      evidence: '依據',
      entryUrl: '入口網址',
      stage: '階段',
      endpoint: '端點',
      quickTest: '快速檢查',
      lastCheck: '上次檢查',
      runtimeSource: '執行期來源',
      canonicalRegistry: '權威登記檔',
      generatedJson: '產生的本機 JSON',
      generatedText: '產生的文字索引',
      unitextEndpoint: 'UniText 查詢端點',
      required: '需要',
      notRequired: '不需要',
      pending: '待補',
      doctor: '診斷 (Doctor)',
      restart: '重啟 (Restart)',
      readiness: '就緒狀態',
      nextAction: '下一步',
      tags: '標籤',
      sources: '來源',
      gaps: '缺口',
      links: '快速連結',
      noGaps: '無',
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
      zhTwCompanion: '繁體中文版本'
    },
    terms: {
      READY: '已就緒 (READY)',
      PARTIAL: '部分完成 (PARTIAL)',
      BLOCKED: '已阻擋 (BLOCKED)',
      UNTRACKED: '未追蹤 (UNTRACKED)',
      ONLINE: '上線 (ONLINE)',
      OFFLINE: '離線 (OFFLINE)',
      ERROR: '錯誤 (ERROR)',
      CHECKING: '檢查中 (CHECKING)',
      FOUND: '已找到 (FOUND)',
      MISSING: '缺少 (MISSING)',
      DISABLED: '已停用 (DISABLED)',
      REVIEW_REQUIRED: '需要審查 (REVIEW_REQUIRED)',
      NOT_APPLICABLE: '不適用 (NOT_APPLICABLE)',
      approved: '已核准 (approved)',
      reviewed: '已審查 (reviewed)',
      candidate: '候選 (candidate)',
      deprecated: '已退役 (deprecated)',
      local: '本機 (local)',
      public: '公開 (public)',
      primary: '主要 (primary)',
      linked: '已連結 (linked)',
      skipped: '已略過 (skipped)',
      drift: '偏移 (drift)',
      required: '需要',
      'not required': '不需要',
      'browser-model-cache': '瀏覽器模型快取 (browser-model-cache)',
      'windows-service-agent': 'Windows 服務代理',
      'runtime-command': '執行期命令',
      'local-web-ui': '本機 Web 介面',
      'hardware-observation': '硬體觀測',
      'filesystem-policy': '檔案系統政策',
      'portable-runtime': '可攜執行期',
      'vite-dev-runtime': 'Vite 開發執行期',
      'source-repo': '來源儲存庫 (source-repo)',
      'devgov-repo': 'DevGov 儲存庫',
      SymbolicLink: '符號連結 (SymbolicLink)',
      Junction: '目錄接合 (Junction)',
      Directory: '資料夾 (Directory)',
      'not installed': '未安裝',
      'user-login': '使用者登入',
      manual: '手動',
      startup: '啟動',
      publicRoute: '公開路由',
      serviceControl: '服務控制'
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
let executionSequence = 0;
let latestExecutionTaskId = null;
const executionTasks = new Map();
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
const executionStatusPanel = document.getElementById('execution-status');
const executionStatusState = document.getElementById('execution-status-state');
const executionStatusName = document.getElementById('execution-status-name');
const executionStatusDetail = document.getElementById('execution-status-detail');
const executionStatusTime = document.getElementById('execution-status-time');
const executionStatusProgress = document.getElementById('execution-status-progress');
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
  const taskId = beginExecutionTask({
    label: t('executionStatus.tasks.workspacePredictor'),
    detail: t('executionStatus.details.workspacePredictor'),
    percent: 24
  });
  try {
    const prediction = renderWorkspacePredictor();
    finishExecutionTask(taskId, 'completed', t('executionStatus.details.workspacePredictorDone') + ' rules=' + prediction.rules.length + '/' + prediction.allRules.length);
    reportWebConsoleEvent('workspace-predictor-run', {
      pathClass: prediction.context.pathClass,
      state: prediction.outcome.state,
      ruleCount: prediction.rules.length,
      ruleTotalCount: prediction.allRules.length
    });
  } catch (error) {
    finishExecutionTask(taskId, 'failed', t('executionStatus.details.workspacePredictorFailed') + ' ' + error.message);
  }
});
workspacePredictorClear.addEventListener('click', () => {
  const taskId = beginExecutionTask({
    label: t('executionStatus.tasks.workspaceClear'),
    detail: t('executionStatus.details.workspaceClear'),
    percent: 40
  });
  workspacePredictorInput.value = '';
  localStorage.removeItem('devgov-workspace-prediction-path');
  renderWorkspacePredictor();
  finishExecutionTask(taskId, 'completed', t('executionStatus.details.workspaceClear'));
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
  const activeView = document.getElementById(button.dataset.view);
  Motion.switchView(activeView, button);
  if (options.enterDashboard) {
    const alignActiveView = () => {
      if (!activeView) return;
      const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom || 0;
      const nextTop = window.scrollY + activeView.getBoundingClientRect().top - headerBottom - 14;
      window.scrollTo(0, Math.max(0, nextTop));
    };
    requestAnimationFrame(alignActiveView);
    setTimeout(alignActiveView, 80);
    setTimeout(alignActiveView, 240);
    addEventListener('load', alignActiveView, { once: true });
  }
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
    if (input.dataset.filter === 'storage-assets') renderStorageAssets(value);
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
  renderStorageAssets(filterValue('storage-assets'));
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
function beginExecutionTask({ label, detail, state = 'running', percent = 8 }) {
  const now = new Date().toISOString();
  const id = 'task-' + Date.now() + '-' + (++executionSequence);
  executionTasks.set(id, {
    id,
    label,
    detail,
    state,
    percent,
    startedAt: now,
    updatedAt: now,
    sequence: executionSequence
  });
  latestExecutionTaskId = id;
  renderExecutionStatus();
  return id;
}
function updateExecutionTask(taskId, patch = {}) {
  const task = executionTasks.get(taskId);
  if (!task) return;
  executionTasks.set(taskId, {
    ...task,
    ...patch,
    updatedAt: new Date().toISOString()
  });
  latestExecutionTaskId = taskId;
  renderExecutionStatus();
}
function finishExecutionTask(taskId, resultState, detail) {
  updateExecutionTask(taskId, {
    state: resultState,
    detail,
    percent: 100
  });
}
function visibleExecutionTask() {
  const tasks = [...executionTasks.values()];
  const active = tasks
    .filter((task) => task.state === 'queued' || task.state === 'running')
    .sort(compareExecutionTasks);
  if (active.length) return active[0];
  return executionTasks.get(latestExecutionTaskId) || null;
}
function compareExecutionTasks(left, right) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || right.sequence - left.sequence;
}
function renderExecutionStatus() {
  if (!executionStatusPanel) return;
  const task = visibleExecutionTask();
  const status = task?.state || 'idle';
  const percent = Math.max(0, Math.min(100, Number(task?.percent || 0)));
  executionStatusPanel.dataset.state = status;
  executionStatusState.className = 'pill ' + executionStatusPillClass(status);
  executionStatusState.textContent = t('executionStatus.' + status);
  executionStatusName.textContent = task?.label || t('executionStatus.empty');
  executionStatusDetail.textContent = task?.detail || t('executionStatus.idleDetail');
  executionStatusTime.textContent = task?.updatedAt ? new Date(task.updatedAt).toLocaleTimeString() : '';
  executionStatusProgress.style.width = percent + '%';
}
function executionStatusPillClass(status) {
  if (status === 'completed') return 'ready';
  if (status === 'failed') return 'error';
  if (status === 'canceled') return 'disabled';
  if (status === 'queued') return 'review_required';
  if (status === 'running') return 'checking';
  return 'checking';
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
    { label: t('metrics.storageAssets'), value: state.summary.storageRecords, view: 'storage-assets' },
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
  renderTable('agents', [t('labels.agent'), t('labels.kind'), t('labels.health'), t('labels.startup'), t('labels.status')], rows.map(row => [textCell(row.displayName), termCell(row.kind), linkify(row.healthUrl), fileRef(row.startupRef), pill(row.status)]));
}
function renderStartup(query) {
  const rows = state.startupEntries.filter(row => match(row, query));
  renderTable('startup', [t('labels.id'), t('labels.trigger'), t('labels.status'), t('labels.script'), t('labels.purpose')], rows.map(row => [textCell(row.id), termCell(row.trigger), pill(row.status), fileRef(row.scriptRef), linkify(row.purpose)]));
}
function renderRoutes(query) {
  const rows = state.publicRoutes.filter(row => match(row, query));
  renderTable('routes', [t('labels.hostname'), t('labels.healthUrl'), t('labels.localTarget'), t('labels.exposure'), t('labels.access'), t('labels.status')], rows.map(row => [linkify('https://' + row.hostname), linkify(row.healthUrl), '<code>' + esc(row.localHost + ':' + row.localPort) + '</code>', termCell(row.exposureClass), row.accessRequired ? tEsc('labels.required') : tEsc('labels.notRequired'), pill(row.status)]));
}
function renderTerminal(query) {
  const rows = state.terminalProfiles.filter(row => match(row, query));
  renderTable('terminal', [t('labels.id'), t('labels.name'), t('labels.assetPolicy'), t('labels.status'), t('labels.notes')], rows.map(row => [textCell(row.id), textCell(row.name), termCell(row.assetPolicy), pill(row.status), linkify(row.notes)]));
}
function renderApiKeys(query) {
  const rows = state.apiKeys.filter(row => match(row, query));
  renderTable('api-keys', [t('labels.variable'), t('labels.service'), t('labels.storage'), t('labels.settings'), t('labels.status')], rows.map(row => [textCell(row.variableName), textCell(row.service), termCell(row.storageLocation), linkify(row.settingsUrl), pill(row.status)]));
}
function renderStorageAssets(query) {
  const rows = state.storageRecords.filter(row => match(row, query));
  const container = document.querySelector('[data-table="storage-assets"]');
  if (!container) return;
  container.innerHTML = rows.length
    ? rows.map(renderStorageAssetPanel).join('')
    : '<div class="storage-empty">' + tEsc('labels.pending') + '</div>';
  bindServiceControlButtons();
  Motion.rows('storage-assets');
}
function renderStorageAssetPanel(row) {
  const policy = localizedStoragePolicy(row);
  return '<article class="storage-asset">'
    + '<header class="storage-asset-head">'
    + renderStorageAssetCell(row)
    + '<div class="storage-asset-summary">' + esc(policy) + '</div>'
    + '<div class="storage-badge-row">' + pill(row.readiness) + pill(row.reviewStatus) + '</div>'
    + '</header>'
    + '<div class="storage-asset-body">'
    + renderStoragePanel(t('labels.policy'), renderStoragePolicyCell(row), 'storage-policy-panel')
    + renderStoragePanel(t('labels.currentStore'), renderStorageCurrentStoreCell(row), 'storage-live-panel')
    + '<div class="storage-operations-column">'
    + renderStoragePanel(t('labels.channels'), renderStorageChannelCell(row), 'storage-channel-panel')
    + renderStoragePanel(t('labels.controls'), renderStorageControlCell(row), 'storage-controls-panel')
    + '</div>'
    + '</div>'
    + '</article>';
}
function renderStoragePanel(title, body, className = '') {
  return '<div class="storage-panel ' + esc(className) + '">'
    + '<div class="storage-panel-title">' + esc(title) + '</div>'
    + body
    + '</div>';
}
function renderStorageAssetCell(row) {
  return '<div class="storage-asset-identity">'
    + '<span class="storage-asset-kicker">' + esc(localizedTerm(row.storageKind)) + '</span>'
    + '<strong class="storage-asset-title">' + esc(localizedStorageLabel(row)) + '</strong>'
    + '<code>' + esc(row.project) + '</code>'
    + '</div>';
}
function renderStoragePolicyCell(row) {
  return '<dl class="storage-info-grid storage-policy-cell">'
    + '<dt>' + tEsc('labels.primaryOwner') + '</dt><dd>' + esc(row.primaryOwner) + '</dd>'
    + '<dt>' + tEsc('labels.modelStore') + '</dt><dd><code>' + esc(row.modelStore) + '</code></dd>'
    + '<dt>' + tEsc('labels.policy') + '</dt><dd>' + esc(localizedStoragePolicy(row)) + '</dd>'
    + '<dt>' + tEsc('labels.sharedWith') + '</dt><dd>' + esc(localizedSharedWith(row)) + '</dd>'
    + '</dl>';
}
function renderStorageCurrentStoreCell(row) {
  const details = storageLiveDetails(row);
  const primary = storagePrimaryChannel(details);
  if (!details?.primaryPath && !primary) {
    return '<div class="storage-detail-cell"><span>' + tEsc('labels.pendingLiveCheck') + '</span><span class="inline-meta">' + esc(localizedStoragePolicy(row)) + '</span></div>';
  }
  const versions = primary?.versions?.length ? primary.versions.join(', ') : '';
  const size = Number.isFinite(primary?.bytes) ? formatStorageBytes(primary.bytes) : '';
  const warnings = Array.isArray(details.warnings) ? details.warnings : [];
  return '<div class="storage-detail-cell">'
    + '<dl class="storage-info-grid">'
    + (details.summary ? '<dt>' + tEsc('labels.liveSummary') + '</dt><dd>' + esc(localizedStorageSummary(details.summary)) + '</dd>' : '')
    + (details.primaryPath ? '<dt>' + tEsc('labels.primaryPath') + '</dt><dd class="storage-path"><code>' + esc(details.primaryPath) + '</code></dd>' : '')
    + (versions ? '<dt>' + tEsc('labels.versions') + '</dt><dd>' + esc(versions) + '</dd>' : '')
    + (size ? '<dt>' + tEsc('labels.physicalSize') + '</dt><dd>' + esc(size) + '</dd>' : '')
    + '</dl>'
    + (warnings.length ? '<div class="storage-note-list">' + warnings.map(warning => '<span class="inline-meta">' + esc(localizedStorageWarning(warning)) + '</span>').join('') + '</div>' : '')
    + '</div>';
}
function renderStorageChannelCell(row) {
  const details = storageLiveDetails(row);
  const channels = Array.isArray(details?.channels) ? details.channels : [];
  if (!channels.length) {
    return '<div class="storage-channel-list">'
      + (row.sharedWith || []).map(channel => '<span class="inline-meta">' + esc(channel) + '</span>').join('')
      + '</div>';
  }
  return '<div class="storage-channel-list">' + channels.map(renderStorageChannelBadge).join('') + '</div>';
}
function renderStorageChannelBadge(channel) {
  const state = channel.rootExists === false
    ? 'skipped'
    : channel.role === 'primary'
      ? 'primary'
      : channel.targetMatchesPrimary
        ? 'linked'
        : 'drift';
  const detailParts = [];
  if (channel.linkType) detailParts.push(localizedTerm(channel.linkType));
  if (Array.isArray(channel.versions) && channel.versions.length) detailParts.push(channel.versions.join(', '));
  if (Number.isFinite(channel.bytes)) detailParts.push(formatStorageBytes(channel.bytes));
  if (channel.rootExists === false) detailParts.push(localizedTerm('not installed'));
  return '<div class="storage-channel storage-channel-' + esc(state) + '">'
    + '<div class="storage-channel-head"><strong>' + esc(channel.name) + '</strong>' + pill(state) + '</div>'
    + (detailParts.length ? '<span class="storage-channel-detail">' + esc(detailParts.join(' / ')) + '</span>' : '')
    + '</div>';
}
function renderStorageControlCell(row) {
  const target = storageControlTarget(row);
  if (!target) {
    return '<div class="storage-control-cell">' + fileRef(row.docsRef) + '</div>';
  }
  return '<div class="storage-control-cell">'
    + '<div class="storage-control-actions">'
    + renderActionRow(target, 'doctor', target.doctor)
    + renderActionRow(target, 'restart', target.restart)
    + '</div>'
    + '<span class="inline-meta">' + fileRef(row.docsRef) + '</span>'
    + '</div>';
}
function storageControlTarget(row) {
  return serviceStatusRows.find(target => target.controlTargetId === row.controlTargetId)
    || state.serviceTargets.find(target => target.controlTargetId === row.controlTargetId);
}
function localizedStorageLabel(row) {
  if (currentLanguage === 'zhTw' && row.id === 'chrome-ai-model-store') return 'Chrome AI 模型儲存區';
  return row.label;
}
function localizedStoragePolicy(row) {
  if (currentLanguage === 'zhTw' && row.id === 'chrome-ai-model-store') {
    return '由 Stable Chrome 擔任主要模型儲存區；已安裝的其他 Chrome 通道透過檔案系統連結共用同一份模型資料。';
  }
  return row.physicalPolicy;
}
function localizedSharedWith(row) {
  if (currentLanguage === 'zhTw' && row.id === 'chrome-ai-model-store') {
    return 'Chrome Beta、Chrome Dev；Chrome Canary 於安裝時納入';
  }
  return (row.sharedWith || []).join(', ');
}
function localizedStorageSummary(value) {
  const text = String(value || '');
  if (currentLanguage !== 'zhTw') return text;
  const chromeModelStore = /^Chrome AI model store is healthy: Stable has (\d+) version folder\(s\); linked channels: ([^;]+); skipped channels: ([^.]+)\.$/.exec(text);
  if (chromeModelStore) {
    return 'Chrome AI 模型儲存區健康：Stable 有 ' + chromeModelStore[1] + ' 個版本資料夾；已連結通道：'
      + chromeModelStore[2].replaceAll(',', '、') + '；略過通道：' + chromeModelStore[3].replaceAll(',', '、') + '。';
  }
  return text
    .replace('Chrome AI model store is healthy', 'Chrome AI 模型儲存區健康')
    .replace('linked channels', '已連結通道')
    .replace('skipped channels', '略過通道')
    .replace('version folder(s)', '個版本資料夾');
}
function localizedStorageWarning(value) {
  const text = String(value || '');
  if (currentLanguage !== 'zhTw') return text;
  if (text === 'Canary user-data root is not present; skipped as not installed.') {
    return '找不到 Canary 使用者資料根目錄；判定為未安裝並略過。';
  }
  return text;
}
function storageLiveDetails(row) {
  const target = storageControlTarget(row);
  return target?.quickTest?.details || target?.live?.details || {};
}
function storagePrimaryChannel(details) {
  const channels = Array.isArray(details?.channels) ? details.channels : [];
  return channels.find(channel => channel.role === 'primary') || null;
}
function formatStorageBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return (unitIndex === 0 ? String(size) : size.toFixed(2)) + ' ' + units[unitIndex];
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
    workspacePredictorRulesMode.hidden = workspacePredictionTab !== 'rules';
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
    + '<div class="prediction-state-row">' + pill(prediction.outcome.state) + '<span class="muted">' + esc(t('workspacePredictor.summaryTitle')) + '</span></div>'
    + '<strong>' + esc(prediction.outcome.label) + '</strong>'
    + '<span>' + esc(t('workspacePredictor.summaryBody')) + '</span>'
    + '</div><div class="prediction-facts">'
    + facts.map(([label, value]) => '<div class="guidance-row"><strong>' + esc(label) + '</strong><span>' + esc(value) + '</span></div>').join('')
    + '</div>';
}
function renderWorkspacePredictionNotes(prediction) {
  return '<details class="prediction-tab-section">'
    + '<summary><span class="prediction-rule-summary-copy"><strong>' + esc(t('workspacePredictor.risksTitle')) + '</strong><span>' + esc(workspaceItemCountLabel(prediction.notes.length)) + '</span></span></summary>'
    + '<div class="prediction-tab-section-body">'
    + '<div class="prediction-cards">'
    + prediction.notes.map((note) => '<article class="prediction-card">' + pill(note.state) + '<h3>' + esc(note.title) + '</h3><span>' + esc(note.body) + '</span></article>').join('')
    + '</div>'
    + '</div>'
    + '</details>'
    + '<details class="prediction-tab-section">'
    + '<summary><span class="prediction-rule-summary-copy"><strong>' + esc(t('workspacePredictor.layersTitle')) + '</strong><span>' + esc(workspaceItemCountLabel(prediction.layers.length)) + '</span></span></summary>'
    + '<div class="prediction-tab-section-body">'
    + renderPredictionTable([t('labels.layer'), t('labels.applies'), t('labels.reason')], prediction.layers.map((layer) => [
      textCell(layer.id),
      pill(layer.applies),
      textCell(layer.reason)
    ]))
    + '</div>'
    + '</details>';
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
  return '<details class="prediction-rule-summary">'
    + '<summary><span class="prediction-rule-summary-copy"><strong>' + esc(modeLabel) + ' · ' + esc(t('workspacePredictor.ruleList.typeSummary')) + '</strong><span>' + esc(workspaceRuleCountLabel(summaryRules.length)) + '</span></span></summary>'
    + '<div class="prediction-rule-summary-body">'
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
    + '</div>'
    + '</details>';
}
function renderWorkspacePredictionRuleBuckets(prediction) {
  const groups = groupWorkspacePredictionRules(prediction.rules);
  if (!groups.length) {
    return '<div class="prediction-rule-empty"><code>' + esc(t('workspacePredictor.empty')) + '</code></div>';
  }
  return groups.map(({ layer, total, types }) => {
    const typeSections = types.map(({ type, rules }) => {
        return '<details class="prediction-rule-group">'
        + '<summary><span class="prediction-rule-summary-copy"><strong>' + esc(localizedWorkspaceRuleValue('ruleTypes', type)) + '</strong><span>' + esc(workspaceRuleCountLabel(rules.length)) + '</span></span></summary>'
        + '<div class="prediction-rule-list">'
        + rules.map(renderWorkspaceRuleItem).join('')
        + '</div>'
        + '</details>';
    }).join('');
    return '<details class="prediction-rule-layer">'
      + '<summary><span class="prediction-rule-summary-copy"><strong>' + esc(localizedWorkspaceRuleValue('ruleLayers', layer)) + '</strong><span>' + esc(workspaceRuleCountLabel(total)) + '</span></span></summary>'
      + '<div class="prediction-rule-layer-body">'
      + typeSections
      + '</div>'
      + '</details>';
  }).join('');
}
function workspaceRuleCountLabel(count) {
  return currentLanguage === 'zhTw'
    ? String(count) + ' ' + t('labels.rule')
    : String(count) + ' rule' + (count === 1 ? '' : 's');
}
function workspaceItemCountLabel(count) {
  return currentLanguage === 'zhTw'
    ? String(count) + ' 項'
    : String(count) + ' item' + (count === 1 ? '' : 's');
}
function renderWorkspaceRuleItem(rule) {
  return '<details class="prediction-rule-item">'
    + '<summary><span class="prediction-rule-id">' + esc(rule.id) + '</span>' + localizedWorkspaceRulePill(rule.applies) + '</summary>'
    + '<dl class="prediction-rule-details">'
    + renderWorkspaceRuleDetail(t('workspacePredictor.ruleHeaders.applies'), localizedWorkspaceRulePill(rule.applies))
    + renderWorkspaceRuleDetail(t('workspacePredictor.ruleHeaders.evidence'), fileRefWithCompanion(rule.evidence))
    + renderWorkspaceRuleDetail(t('workspacePredictor.ruleHeaders.reason'), textCell(rule.reason))
    + renderWorkspaceRuleDetail(t('workspacePredictor.ruleHeaders.execution'), renderWorkspaceRuleExecution(rule.execution))
    + '</dl>'
    + '</details>';
}
function renderWorkspaceRuleDetail(label, content) {
  return '<div class="prediction-rule-detail-row"><dt>' + esc(label) + '</dt><dd>' + content + '</dd></div>';
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
  return '<div class="prediction-tab-intro"><strong>' + esc(rulesTitle) + '</strong><span>' + esc(t('workspacePredictor.ruleList.intro')) + '</span></div>'
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
  return '<div class="prediction-tab-intro"><strong>' + esc(t('workspacePredictor.checksTitle')) + '</strong><span>' + esc(t('workspacePredictor.checksBody')) + '</span></div>'
    + '<details class="prediction-tab-section">'
    + '<summary><span class="prediction-rule-summary-copy"><strong>' + esc(t('workspacePredictor.checksTitle')) + '</strong><span>' + esc(workspaceItemCountLabel(prediction.checks.length)) + '</span></span></summary>'
    + '<div class="prediction-tab-section-body">'
    + renderPredictionTable([t('labels.rule'), t('labels.when'), t('labels.command')], prediction.checks.map((check) => [
      textCell(localizedWorkspaceCheckText(check.label)),
      textCell(localizedWorkspaceCheckText(check.when)),
      '<code>' + esc(check.command) + '</code>'
    ]))
    + '</div>'
    + '</details>';
}
function localizedWorkspaceCheckText(value) {
  const text = String(value || '');
  if (currentLanguage !== 'zhTw') return text;
  const replacements = {
    'Path scope validation': '路徑範圍驗證',
    'Repository pre-flight': '儲存庫預檢',
    'Worktree container check': '工作樹容器檢查',
    'Registry boundary check': '登記檔邊界檢查',
    'Selected project scan': '選取專案掃描',
    'DevGov tests': 'DevGov 測試',
    'AGENTS index': 'AGENTS 索引',
    'Registry validation': '登記檔驗證',
    Doctor: 'Doctor[診斷]',
    'Worktree governance': '工作樹治理',
    'Before predicting or editing.': '預測或編輯之前。',
    'Before changing files.': '變更檔案之前。',
    'Before any cleanup action.': '執行任何清理動作之前。',
    'Before persisting canonical records.': '寫入權威紀錄之前。',
    'Before editing a selected repository': '編輯選取的儲存庫之前',
    'When the selected workspace has web or local service ports': '選取工作區含有 Web 或本機服務連接埠時',
    'Before reporting dashboard changes complete': '回報儀表板變更完成之前',
    'After changing AGENTS governance surfaces': '變更 AGENTS 治理介面之後',
    'After registry-facing changes': '變更登記檔相關內容之後',
    'Before final DevGov handoff': '最終交付 DevGov 工作之前',
    'Because the selected path looks like linked worktree storage': '因為選取路徑看起來像 linked worktree[連結工作樹] 儲存位置'
  };
  return replacements[text] ?? text;
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
async function refreshServiceStatus(options = {}) {
  const taskId = options.silent ? null : beginExecutionTask({
    label: t('executionStatus.tasks.serviceStatus'),
    detail: t('executionStatus.details.serviceStatus'),
    percent: 18
  });
  try {
    if (taskId) updateExecutionTask(taskId, { percent: 38 });
    const response = await fetch('/api/service-status');
    const payload = await response.json();
    serviceStatusRows = payload.services || [];
    if (taskId) finishExecutionTask(taskId, 'completed', t('executionStatus.details.serviceStatusDone') + ' ' + resultCountLabel(serviceStatusRows.length));
  } catch (error) {
    serviceStatusRows = state.serviceTargets.map(target => ({ ...target, live: { state: 'ERROR', error: error.message } }));
    if (taskId) finishExecutionTask(taskId, 'failed', t('executionStatus.details.serviceStatusFailed') + ' ' + error.message);
  } finally {
    renderServiceStatusTable(document.querySelector('input[data-filter="service-status"]').value.toLowerCase(), serviceStatusRows);
    renderStorageAssets(filterValue('storage-assets'));
  }
}
async function refreshServiceOnboarding() {
  const taskId = beginExecutionTask({
    label: t('executionStatus.tasks.serviceOnboarding'),
    detail: t('executionStatus.details.serviceOnboarding'),
    percent: 18
  });
  onboardingButton.disabled = true;
  try {
    updateExecutionTask(taskId, { percent: 42 });
    const response = await fetch('/api/service-onboarding');
    const payload = await response.json();
    serviceOnboardingRows = payload.services || [];
    finishExecutionTask(taskId, 'completed', t('executionStatus.details.serviceOnboardingDone') + ' ' + resultCountLabel(serviceOnboardingRows.length));
  } catch (error) {
    serviceOnboardingRows = [];
    finishExecutionTask(taskId, 'failed', t('executionStatus.details.serviceOnboardingFailed') + ' ' + error.message);
  } finally {
    onboardingButton.disabled = false;
    renderServiceOnboardingTable(filterValue('service-onboarding'), serviceOnboardingRows);
  }
}
async function refreshWebConsoleEvents() {
  const taskId = beginExecutionTask({
    label: t('executionStatus.tasks.webConsoleEvents'),
    detail: t('executionStatus.details.webConsoleEvents'),
    percent: 18
  });
  try {
    updateExecutionTask(taskId, { percent: 44 });
    const response = await fetch('/api/web-console-events');
    const payload = await response.json();
    webConsoleEventsRows = payload.events || [];
    finishExecutionTask(taskId, 'completed', t('executionStatus.details.webConsoleEventsDone') + ' ' + resultCountLabel(webConsoleEventsRows.length));
  } catch (error) {
    webConsoleEventsRows = [];
    finishExecutionTask(taskId, 'failed', t('executionStatus.details.webConsoleEventsFailed') + ' ' + error.message);
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
    + '<div class="tag-list">' + projectTagPill(row.progressTag) + '<span class="inline-meta">' + esc(percent + '%') + '</span></div>'
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
  return '<div class="tag-list project-tag-list">' + tags.slice(0, 8).map(projectTagPill).join('') + '</div>';
}
function renderNextActionCell(row) {
  const raw = row.nextAction || '-';
  return '<div class="next-action-cell" title="' + esc(raw) + '"><span>' + esc(localizedNextAction(raw)) + '</span></div>';
}
function renderProjectSources(row) {
  const refs = [...(row.sourceRefs || []), ...(row.reviewEvidence || [])];
  if (!refs.length) return '<span class="inline-meta">' + tEsc('labels.pending') + '</span>';
  const groups = projectSourceGroups(refs);
  const visible = groups.slice(0, 2);
  const hidden = groups.slice(2);
  const title = refs.join('\\n');
  return '<div class="source-link-list" title="' + esc(title) + '">'
    + visible.map(renderProjectSourceChip).join('')
    + (hidden.length ? '<span class="pill source-more" title="' + esc(hidden.flatMap((group) => group.refs).join('\\n')) + '">+' + esc(hidden.length) + '</span>' : '')
    + '</div>';
}
function projectTagPill(value) {
  const raw = String(value || '');
  const label = localizedProjectTag(raw);
  return '<span class="pill project-tag ' + esc(raw.toLowerCase()) + '" title="' + esc(raw) + '">' + breakableText(label) + '</span>';
}
function localizedProjectTag(value) {
  const tag = String(value || '');
  const maps = {
    en: {
      PARTIAL: 'Partial',
      READY: 'Ready',
      BLOCKED: 'Blocked',
      UNTRACKED: 'Untracked',
      reviewed: 'Reviewed',
      candidate: 'Candidate',
      local: 'Local',
      public: 'Public',
      'prod-protected': 'Protected prod',
      'staging-private': 'Private staging',
      'source-repo': 'Source repo',
      'devgov-repo': 'DevGov repo',
      'source-repo-and-loopback-runtime': 'Repo + loopback',
      'source-repo-and-user-level-cloudflared': 'Repo + Cloudflared',
      'source-repo-and-runtime-project': 'Repo + runtime',
      'source-repo-and-portable-runtime': 'Repo + portable',
      'source-repo-and-personal-local-tool': 'Personal tool',
      'source-repo-and-windows-service': 'Repo + service',
      'source-repo-and-hardware-device': 'Repo + device',
      'external-local-app': 'Local app',
      'external-local-app-and-filesystem-policy': 'Local app + policy',
      'portable-tool': 'Portable tool',
      'public-api': 'Public API',
      'public-health': 'Public health',
      'runtime-plan-and-user-startup': 'Plan + startup',
      'source-and-runtime-command': 'Source + command',
      'aggregated-windows-entrypoint': 'Windows entry'
    },
    zhTw: {
      PARTIAL: '部分完成',
      READY: '已就緒',
      BLOCKED: '已阻擋',
      UNTRACKED: '未追蹤',
      reviewed: '已審查',
      candidate: '候選',
      local: '本機',
      public: '公開',
      'prod-protected': '生產保護',
      'staging-private': '私有測試環境',
      'source-repo': '來源儲存庫',
      'devgov-repo': 'DevGov 儲存庫',
      'source-repo-and-loopback-runtime': '儲存庫 + loopback 執行期',
      'source-repo-and-user-level-cloudflared': '儲存庫 + 使用者層 Cloudflared',
      'source-repo-and-runtime-project': '儲存庫 + 執行期專案',
      'source-repo-and-portable-runtime': '儲存庫 + 可攜執行期',
      'source-repo-and-personal-local-tool': '個人工具',
      'source-repo-and-windows-service': '儲存庫 + Windows 服務',
      'source-repo-and-hardware-device': '儲存庫 + 硬體裝置',
      'external-local-app': '本機外部應用程式',
      'external-local-app-and-filesystem-policy': '本機應用程式 + 檔案政策',
      'portable-tool': '可攜工具',
      'public-api': '公開 API',
      'public-health': '公開健康檢查',
      'runtime-plan-and-user-startup': '計畫 + 使用者啟動',
      'source-and-runtime-command': '來源 + 執行期指令',
      'aggregated-windows-entrypoint': 'Windows 入口'
    }
  };
  return maps[currentLanguage]?.[tag] || shortenProjectTag(tag);
}
function shortenProjectTag(value) {
  const text = String(value || '');
  if (currentLanguage === 'zhTw') {
    return text
      .replace(/^source-repo-and-/, '來源儲存庫 + ')
      .replace(/^source-repo$/, '來源儲存庫')
      .replace(/user-level-cloudflared/g, '使用者層 Cloudflared')
      .replace(/loopback-runtime/g, 'loopback 執行期')
      .replace(/portable-runtime/g, '可攜執行期')
      .replace(/runtime-project/g, '執行期專案')
      .replace(/personal-local-tool/g, '個人工具')
      .replace(/windows-service/g, 'Windows 服務')
      .replace(/hardware-device/g, '硬體裝置')
      .replace(/-/g, ' ');
  }
  return text
    .replace(/^source-repo-and-/, 'repo+')
    .replace(/^source-repo$/, 'source repo')
    .replace(/user-level-cloudflared/g, 'cloudflared')
    .replace(/loopback-runtime/g, 'loopback')
    .replace(/portable-runtime/g, 'portable')
    .replace(/runtime-project/g, 'runtime')
    .replace(/personal-local-tool/g, 'personal tool')
    .replace(/-/g, ' ');
}
function breakableText(value) {
  return esc(value).replace(/([+:/-])/g, '$1<wbr>');
}
function localizedNextAction(value) {
  const text = String(value || '');
  if (currentLanguage !== 'zhTw') return text;
  const replacements = [
    ['Complete normal signed-in ChatGPT Web connector acceptance before promoting a dashboard-safe Restart action for this protected public boundary.', '完成 ChatGPT Web 連接器登入驗收，再升級受保護公開邊界的安全 Restart。'],
    ['Decide whether the runtime project should migrate away from 4321 on this workstation or whether the Windows port exclusion should be removed.', '決定 runtime 專案是否避開 4321，或移除這台工作站的 Windows port exclusion。'],
    ['Decide later whether ShaderGlass launch/open-folder actions should become separate DevGov-managed controls distinct from preview health.', '稍後決定 ShaderGlass 啟動與開啟資料夾是否成為獨立 DevGov 控制。'],
    ['Keep as reference implementation for the remaining service onboarding records.', '保留為剩餘服務 onboarding records 的參考實作。'],
    ['Keep the personal workflow wrapper local-only and update it separately if the cached plugin launcher falls behind the draw-draw workspace name.', '個人 workflow wrapper 維持本機限定；plugin launcher 落後時再單獨更新。'],
    ['Decide later whether extension smoke testing should become a separate DevGov-managed action distinct from local Vite runtime health.', '稍後決定 extension smoke testing 是否成為獨立 DevGov action。'],
    ['If Chrome changes the component layout, update the Doctor expectations before changing the Reset behavior.', '若 Chrome component layout 改變，先更新 Doctor 預期，再調整 Reset 行為。'],
    ['Collect one completed health + doctor + startup evidence report and promote after validation.', '收集一份完整 health + doctor + startup 證據報告，驗證後再升級狀態。'],
    ['Decide later whether the unauthenticated quick-test row should be normalized around the protected 401 response or replaced with a separate operator-safe health contract.', '稍後決定未驗證 quick-test 是否改以受保護 401 回應為準，或改成另一個 operator-safe health contract。'],
    ['Decide later whether canonical parser bridge availability should become a separate DevGov-managed readiness dimension.', '稍後決定 canonical parser bridge 可用性是否成為獨立 DevGov readiness 維度。'],
    ['Decide later whether Taste also needs reviewed login startup automation beyond the current on-demand control path.', '稍後決定 Taste 是否需要已審查的登入啟動自動化，並超出目前 on-demand 控制路徑。'],
    ['Decide later whether the nested duplicate url-hero/ folder should stay as evidence-only or be retired after a separate source-of-truth cleanup.', '稍後決定重複的巢狀 url-hero/ 資料夾要保留為 evidence-only，或在 source-of-truth 清理後退役。'],
    ['Keep port references aligned with canonical 5001 governance entries; remove remaining 8765 references outside historical logs.', '讓 port references 對齊權威 5001 governance entries，移除歷史 logs 以外殘留的 8765 references。'],
    ['Decide later whether startup persistence evidence should be promoted into a separate DevGov status row, distinct from on-demand recovery.', '稍後決定 startup persistence evidence 是否升級為獨立 DevGov status row，並與 on-demand recovery 分開。'],
    ['Decide later whether the active TB2 tunnel startup should be promoted into a dedicated reviewed startup authority instead of remaining an operator-managed background connector.', '稍後決定啟用中的 TB2 tunnel startup 是否升級為已審查的專用 startup authority，而不是 operator-managed background connector。']
  ];
  for (const [source, replacement] of replacements) {
    if (text === source) return replacement;
  }
  if (text.startsWith('Archive stale references in historical notes')) return '封存歷史 notes 裡以 video-render-kit 作為 placeholder 的舊引用；權威專案仍是 photo-hdr-flow。';
  const loginStartup = /^Decide later whether (.+) should (?:also )?have reviewed login-startup (?:authority|expectations), distinct from the current (.+) control path\.$/.exec(text);
  if (loginStartup) return '稍後決定 ' + loginStartup[1] + ' 是否需要已審查的登入啟動規則，並與目前 ' + loginStartup[2] + ' 控制路徑分開。';
  const loginStartupAuthority = /^Decide later whether (.+) should gain a reviewed login-startup authority, distinct from the current (.+) control path\.$/.exec(text);
  if (loginStartupAuthority) return '稍後決定 ' + loginStartupAuthority[1] + ' 是否需要已審查的登入啟動 authority，並與目前 ' + loginStartupAuthority[2] + ' 控制路徑分開。';
  const separateAction = /^Decide later whether (.+) should become a separate DevGov-managed (.+) distinct from (.+)\.$/.exec(text);
  if (separateAction) return '稍後決定 ' + separateAction[1] + ' 是否成為獨立 DevGov ' + separateAction[2] + '，並與 ' + separateAction[3] + ' 分開。';
  const gainContract = /^Decide later whether (.+) should gain a separate (.+) beyond the current (.+)\.$/.exec(text);
  if (gainContract) return '稍後決定 ' + gainContract[1] + ' 是否需要獨立 ' + gainContract[2] + '，並超出目前 ' + gainContract[3] + '。';
  const readinessRow = /^Decide later whether (.+) readiness should become a separate DevGov-managed local service row\.$/.exec(text);
  if (readinessRow) return '稍後決定 ' + readinessRow[1] + ' readiness 是否成為獨立 DevGov 本機服務列。';
  return text;
}
function projectSourceGroups(refs) {
  const groups = new Map();
  for (const ref of refs) {
    const pathPart = localFilePathPart(ref);
    const key = projectSourceKey(pathPart || ref);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: projectSourceLabel(pathPart || ref),
        refs: [],
        firstRef: ref
      });
    }
    groups.get(key).refs.push(ref);
  }
  return [...groups.values()];
}
function projectSourceKey(pathPart) {
  if (pathPart.includes('ports.registry.json')) return 'ports';
  if (pathPart.includes('public-routes.registry.json')) return 'public-routes';
  if (pathPart.includes('service-onboarding')) return 'onboarding';
  if (pathPart.includes('service-control.registry.json')) return 'service-control';
  if (pathPart.includes('startup.registry.json')) return 'startup';
  if (pathPart.includes('local-agents.registry.json')) return 'local-agents';
  if (pathPart.startsWith('reports/')) return 'reports';
  return pathPart;
}
function projectSourceLabel(pathPart) {
  const zhTw = currentLanguage === 'zhTw';
  if (pathPart.includes('ports.registry.json')) return zhTw ? '連接埠登記' : 'Ports';
  if (pathPart.includes('public-routes.registry.json')) return zhTw ? '公開路由' : 'Routes';
  if (pathPart.includes('service-onboarding')) return zhTw ? '補充程序' : 'Onboarding';
  if (pathPart.includes('service-control.registry.json')) return zhTw ? '服務控制' : 'Controls';
  if (pathPart.includes('startup.registry.json')) return zhTw ? '啟動治理' : 'Startup';
  if (pathPart.includes('local-agents.registry.json')) return zhTw ? '本機代理' : 'Agents';
  if (pathPart.startsWith('reports/')) return zhTw ? '報告' : 'Reports';
  return zhTw ? '來源' : 'Source';
}
function renderProjectSourceChip(group) {
  const target = localFileTarget(group.firstRef);
  const title = group.refs.join('\\n');
  const label = group.refs.length > 1 ? group.label + ' ' + group.refs.length : group.label;
  if (!target) return '<span class="pill source-chip" title="' + esc(title) + '">' + esc(label) + '</span>';
  return '<a class="pill pill-link source-chip" href="' + esc(target.href) + '" target="_blank" rel="noreferrer" title="' + esc(title) + '">' + esc(label) + '</a>';
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
  const label = localizedControlLabel(control?.uiLabel || t('labels.' + action));
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
      details.push('<span class="inline-meta">' + esc(localizedControlDetail(actionStatus.policyReadiness.policyMessage || 'Restart policy is incomplete')) + '</span>');
    }
  } else if (isRestart && control?.approved) {
    details.push('<span class="inline-meta">' + esc(localizedControlDetail('Restart policy evidence missing in registry')) + '</span>');
  }
  if (actionState?.message) {
    details.push('<span class="inline-meta">' + esc(localizedControlDetail(actionState.message)) + '</span>');
  }
  return '<div class="check-row"><span class="check-label">' + esc(label) + '</span><span class="check-status">' + status + '</span><span class="check-detail">' + details.join('') + '</span></div>';
}
function actionControlPill(row, action, state, control, actionState) {
  const label = localizedControlLabel(control?.uiLabel || t('labels.' + action));
  const targetLabel = row.label || row.id || row.controlTargetId;
  const actionText = currentLanguage === 'zhTw'
    ? '執行 ' + label + ': ' + targetLabel
    : 'Run ' + label + ': ' + targetLabel;
  const title = control?.wrapperRef ? actionText + ' (' + control.wrapperRef + ')' : actionText;
  return '<button class="pill status-action ' + esc(classToken(state)) + '" type="button" data-service-action="' + esc(action) + '" data-control-target="' + esc(row.controlTargetId) + '"' + (actionState?.pending ? ' disabled' : '') + ' title="' + esc(title) + '" aria-label="' + esc(actionText) + '"><span>' + esc(localizedTerm(state)) + '</span><span class="action-key" aria-hidden="true">&#128477;&#65039;</span></button>';
}
function renderServiceCell(row) {
  return '<div class="service-cell">'
    + '<div class="service-badges">' + pill(row.live?.state || 'CHECKING') + pill(row.registryStatus) + '</div>'
    + '<span class="service-name">' + esc(row.label) + '</span>'
    + '<span class="inline-meta">' + esc(localizedTerm(row.kind)) + '</span>'
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
    + (row.live.statusCode ? '<span class="inline-meta">' + esc(currentLanguage === 'zhTw' ? 'HTTP 狀態=' : 'status=') + esc(row.live.statusCode) + '</span>' : '')
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
  const label = localizedControlLabel(control?.uiLabel || t('labels.' + action));
  const targetLabel = target?.label || controlTargetId;
  const executionTaskId = beginExecutionTask({
    label: t('executionStatus.tasks.serviceControl') + ': ' + label,
    detail: targetLabel,
    state: control?.requiresConfirmation ? 'queued' : 'running',
    percent: control?.requiresConfirmation ? 8 : 22
  });
  openControlDialog({
    controlTargetId,
    action,
    title: label,
    targetLabel,
    wrapperRef: control?.wrapperRef || ''
  });
  if (control?.requiresConfirmation) {
    setControlDialogMode('confirm');
    updateExecutionTask(executionTaskId, {
      state: 'queued',
      percent: 12,
      detail: t('executionStatus.details.serviceControlConfirm') + ' ' + targetDetailLabel(targetLabel)
    });
    appendControlLog(currentLanguage === 'zhTw'
      ? '這個動作會嘗試調整本機 runtime，需先確認。'
      : 'This action may adjust the local runtime and requires confirmation.');
    const confirmed = await waitForControlDialogConfirmation();
    if (!confirmed) {
      setControlDialogMode('canceled');
      appendControlLog(currentLanguage === 'zhTw' ? '使用者取消執行。' : 'Canceled by operator.');
      controlActionStates[actionKey] = { pending: false, message: t('controlDialog.canceled') };
      finishExecutionTask(executionTaskId, 'canceled', t('executionStatus.details.serviceControlCanceled'));
      renderServiceStatusTable(filterValue('service-status'), serviceStatusRows);
      renderStorageAssets(filterValue('storage-assets'));
      return;
    }
  }
  setControlDialogMode('running');
  appendControlLog((currentLanguage === 'zhTw' ? '送出控制請求: ' : 'Sending control request: ') + actionKey);
  if (control?.wrapperRef) appendControlLog('wrapper=' + control.wrapperRef);
  controlActionStates[actionKey] = { pending: true, message: currentLanguage === 'zhTw' ? '執行中...' : 'Running...' };
  updateExecutionTask(executionTaskId, {
    state: 'running',
    percent: 34,
    detail: t('executionStatus.details.serviceControlRun') + ' ' + targetDetailLabel(targetLabel)
  });
  renderServiceStatusTable(filterValue('service-status'), serviceStatusRows);
  renderStorageAssets(filterValue('storage-assets'));
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
    updateExecutionTask(executionTaskId, {
      percent: 76,
      detail: localizedControlDetail(payload.summary || t('executionStatus.details.serviceControlDone'))
    });
    appendControlLog((currentLanguage === 'zhTw' ? '事件 ID=' : 'eventId=') + (payload.eventId || 'n/a'));
    appendControlLog((currentLanguage === 'zhTw' ? '摘要=' : 'summary=') + localizedControlDetail(payload.summary || 'Completed'));
    controlActionStates[actionKey] = {
      pending: false,
      message: localizedControlDetail(payload.summary || (currentLanguage === 'zhTw' ? '已完成' : 'Completed'))
    };
    await refreshServiceStatus({ silent: true });
    appendControlLog(currentLanguage === 'zhTw' ? '服務狀態已刷新。' : 'Service Status refreshed.');
    setControlDialogMode('completed');
    finishExecutionTask(executionTaskId, 'completed', localizedControlDetail(payload.summary || t('executionStatus.details.serviceControlDone')) + ' ' + refreshDetailLabel('service-status'));
  } catch (error) {
    appendControlLog((currentLanguage === 'zhTw' ? '錯誤=' : 'error=') + error.message);
    setControlDialogMode('failed');
    controlActionStates[actionKey] = { pending: false, message: error.message };
    finishExecutionTask(executionTaskId, 'failed', t('executionStatus.details.serviceControlFailed') + ' ' + error.message);
    renderServiceStatusTable(filterValue('service-status'), serviceStatusRows);
    renderStorageAssets(filterValue('storage-assets'));
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
  appendControlLog((currentLanguage === 'zhTw' ? '動作: ' : 'Action: ') + localizedActionName(action));
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
  const raw = String(value ?? '');
  return '<span class="pill ' + esc(classToken(raw)) + '">' + esc(localizedTerm(raw)) + '</span>';
}
function linkedPill(value, ref, label) {
  const raw = String(value ?? '');
  const target = localFileTarget(ref) || registryReferenceTarget(label, ref);
  if (!target) return pill(value);
  return '<a class="pill pill-link ' + esc(classToken(raw)) + '" href="' + esc(target.href) + '" target="_blank" rel="noreferrer" title="' + esc(target.text) + '" aria-label="' + esc(label + ' reference: ' + target.text) + '">' + esc(localizedTerm(raw)) + '</a>';
}
function registryReferenceTarget(label, ref) {
  const restartLabels = new Set(['Restart', t('labels.restart')]);
  if (!restartLabels.has(label) || !ref) return null;
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
function termCell(value) {
  return esc(localizedTerm(value));
}
function localizedTerm(value) {
  const raw = String(value ?? '');
  if (currentLanguage !== 'zhTw') return raw;
  return messages.zhTw.terms?.[raw] ?? raw;
}
function resultCountLabel(count) {
  return currentLanguage === 'zhTw' ? '列數=' + count : 'rows=' + count;
}
function targetDetailLabel(value) {
  return currentLanguage === 'zhTw' ? '目標=' + value : 'target=' + value;
}
function refreshDetailLabel(value) {
  return currentLanguage === 'zhTw' ? '刷新=' + value : 'refresh=' + value;
}
function localizedActionName(action) {
  if (currentLanguage !== 'zhTw') return action;
  if (action === 'restart') return t('labels.restart');
  if (action === 'doctor') return t('labels.doctor');
  return action;
}
function localizedControlLabel(label) {
  const text = String(label || '');
  if (currentLanguage !== 'zhTw') return text;
  if (text === 'Doctor') return t('labels.doctor');
  if (text === 'Restart') return t('labels.restart');
  if (text === 'Reset') return '重設 (Reset)';
  return text;
}
function localizedControlDetail(value) {
  const text = String(value || '');
  if (currentLanguage !== 'zhTw') return text;
  if (text === 'Completed') return '已完成';
  if (text === 'Policy reviewed.') return '政策已審查。';
  if (text === 'Restart policy is incomplete') return '重啟政策尚未完整。';
  if (text === 'Restart policy evidence missing in registry') return '登記檔缺少重啟政策依據。';
  return text
    .replace('Chrome AI model store is healthy', 'Chrome AI 模型儲存區健康')
    .replace('Chrome AI model store reset completed', 'Chrome AI 模型儲存區重設完成')
    .replace('Stable has', 'Stable 有')
    .replace('version folder(s)', '個版本資料夾')
    .replace('linked channels', '已連結通道')
    .replace('skipped channels', '略過通道')
    .replace('no filesystem changes were needed', '不需要變更檔案系統')
    .replace('Control action failed', '控制動作失敗');
}
function classToken(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
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
    'storage-assets': placeholders.storageAssets,
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
  renderExecutionStatus();
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
    this.stagger(table.querySelectorAll('tr, .storage-asset'), [
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
          summary: parsed.summary,
          details: parsed,
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
