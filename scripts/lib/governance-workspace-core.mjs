const DEFAULT_PAGE_SIZE = 6;
const MAX_PAGE_SIZE = 10;

export const GOVERNANCE_WORKSPACE_VIEWS = [
  view("pulse", "overview", "Overview", "總覽"),
  view("pulse", "service-status", "Service Status", "服務狀態"),
  view("pulse", "service-onboarding", "Service Onboarding", "服務導入"),
  view("pulse", "web-console-events", "Web Console Events", "主控台事件"),
  view("registry", "registered-projects", "Registered Projects", "已註冊專案"),
  view("registry", "local-agents", "Local Agents", "本機 Agents"),
  view("registry", "api-keys", "API Keys", "API 金鑰"),
  view("registry", "storage-assets", "Storage Assets", "儲存資源"),
  view("registry", "agent-instructions", "Agent Instructions", "Agent 指令"),
  view("operations", "ports", "Ports", "連接埠"),
  view("operations", "startup", "Startup", "啟動項目"),
  view("operations", "public-routes", "Public Routes", "公開路由"),
  view("operations", "terminal-profiles", "Terminal Profiles", "終端設定檔"),
  view("operations", "web-entrypoints", "Web Entrypoints", "Web 入口"),
  view("workspace", "workspace-predictor", "Workspace Predictor", "工作區預測器")
];

const FOLDERS = [
  { id: "pulse", label: "Pulse", labelZh: "脈動" },
  { id: "registry", label: "Registry", labelZh: "登錄" },
  { id: "operations", label: "Operations", labelZh: "維運" },
  { id: "workspace", label: "Workspace", labelZh: "工作區" }
];

export function buildGovernanceWorkspaceView({ state, serviceStatus, resourceSnapshot, approvedControls = [] }, options = {}) {
  const requestedId = String(options.viewId || "service-status");
  const definition = GOVERNANCE_WORKSPACE_VIEWS.find((item) => item.id === requestedId)
    ?? GOVERNANCE_WORKSPACE_VIEWS.find((item) => item.id === "service-status");
  const pageSize = clampInteger(options.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const query = safeText(options.query, 80).toLowerCase();
  const rawRows = rowsForView(definition.id, { state, serviceStatus, approvedControls });
  const filteredRows = query
    ? rawRows.filter((row) => JSON.stringify(row.cells).toLowerCase().includes(query))
    : rawRows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = clampInteger(options.page, 1, pageCount, 1);
  const start = (page - 1) * pageSize;
  const visibleRows = filteredRows.slice(start, start + pageSize);

  return {
    schema: "devgov.governance-workspace-view.v1",
    generatedAt: resourceSnapshot?.generatedAt ?? serviceStatus?.generatedAt ?? new Date().toISOString(),
    navigation: buildNavigation(state, serviceStatus),
    view: {
      ...definition,
      columns: columnsForView(definition.id),
      metrics: metricsForView(definition.id, { state, serviceStatus, resourceSnapshot }),
      rows: visibleRows,
      emptyMessage: query ? "No matching governed records." : "No governed records are registered for this view.",
      query,
      page: {
        number: page,
        size: pageSize,
        totalRows: filteredRows.length,
        totalPages: pageCount,
        hasPrevious: page > 1,
        hasNext: page < pageCount
      }
    }
  };
}

export function buildWorkspacePathPrediction(state, workspacePath = "") {
  const raw = String(workspacePath ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!raw) return prediction("PENDING", "No path selected", "empty", "", state);
  const normalized = raw.replace(/\//g, "\\").replace(/\\+$/g, "");
  const absolute = /^[A-Za-z]:\\/.test(normalized);
  const underQ = /^Q:\\/i.test(normalized);
  const underProjects = /^Q:\\Projects(?:\\|$)/i.test(normalized);
  const parts = normalized.split("\\").filter(Boolean);
  const projectName = underProjects && parts.length >= 3 ? safeText(parts[2], 80) : "";
  if (!absolute) return prediction("REVIEW_REQUIRED", "Use an absolute workspace path", "relative", projectName, state);
  if (!underQ) return prediction("BLOCKED", "Workspace is outside the governed Q: root", "outside-q", projectName, state);
  if (!underProjects) return prediction("REVIEW_REQUIRED", "Workspace is outside Q:\\Projects", "q-drive-non-projects", projectName, state);
  return prediction("READY", "Workspace matches the governed project-root policy", "q-projects-workspace", projectName, state);
}

function prediction(stateLabel, summary, pathClass, projectName, dashboardState) {
  const model = dashboardState?.workspacePrediction ?? {};
  return {
    schema: "devgov.workspace-path-prediction.v1",
    state: stateLabel,
    summary,
    pathClass,
    projectName,
    layers: (model.layers ?? []).slice(0, 6).map((item) => ({
      id: safeText(item.id, 80),
      scope: safeText(item.scope, 80),
      status: safeText(item.status, 40)
    })),
    checks: [
      { id: "absolute", state: pathClass === "relative" || pathClass === "empty" ? "PENDING" : "READY", label: "Absolute path" },
      { id: "governed-root", state: pathClass === "outside-q" ? "BLOCKED" : pathClass === "empty" ? "PENDING" : "READY", label: "Governed root" },
      { id: "project-root", state: pathClass === "q-projects-workspace" ? "READY" : pathClass === "empty" ? "PENDING" : "REVIEW_REQUIRED", label: "Project container" }
    ],
    ruleCount: Array.isArray(model.rules) ? model.rules.length : 0
  };
}

function buildNavigation(state, serviceStatus) {
  const counts = new Map(GOVERNANCE_WORKSPACE_VIEWS.map((definition) => [definition.id, rowCountForView(definition.id, state, serviceStatus)]));
  return FOLDERS.map((folder, depth) => ({
    ...folder,
    depth,
    views: GOVERNANCE_WORKSPACE_VIEWS
      .filter((definition) => definition.folderId === folder.id)
      .map((definition) => ({ ...definition, count: counts.get(definition.id) ?? 0 }))
  }));
}

function rowCountForView(viewId, state, serviceStatus) {
  if (viewId === "overview") return 1;
  if (viewId === "service-status") return serviceStatus?.services?.length ?? 0;
  return ({
    "service-onboarding": state?.onboardingEntries,
    "web-console-events": state?.webConsoleEvents,
    "registered-projects": state?.registeredProjects,
    "local-agents": state?.localAgents,
    "api-keys": state?.apiKeys,
    "storage-assets": state?.storageRecords,
    "agent-instructions": state?.agentInstructions?.entries,
    ports: state?.ports,
    startup: state?.startupEntries,
    "public-routes": state?.publicRoutes,
    "terminal-profiles": state?.terminalProfiles,
    "web-entrypoints": state?.webEntrypoints,
    "workspace-predictor": state?.workspacePrediction?.rules
  }[viewId] ?? []).length;
}

function rowsForView(viewId, context) {
  const { state = {}, serviceStatus = {}, approvedControls = [] } = context;
  const sources = {
    overview: [{ id: "overview", summary: state.summary ?? {} }],
    "service-status": serviceStatus.services ?? [],
    "service-onboarding": state.onboardingEntries ?? [],
    "web-console-events": state.webConsoleEvents ?? [],
    "registered-projects": state.registeredProjects ?? [],
    "local-agents": state.localAgents ?? [],
    "api-keys": state.apiKeys ?? [],
    "storage-assets": state.storageRecords ?? [],
    "agent-instructions": state.agentInstructions?.entries ?? [],
    ports: state.ports ?? [],
    startup: state.startupEntries ?? [],
    "public-routes": state.publicRoutes ?? [],
    "terminal-profiles": state.terminalProfiles ?? [],
    "web-entrypoints": state.webEntrypoints ?? [],
    "workspace-predictor": state.workspacePrediction?.rules ?? []
  };
  return (sources[viewId] ?? []).map((item, index) => rowForView(viewId, item, index, approvedControls));
}

function rowForView(viewId, item, index, approvedControls) {
  const id = safeText(item?.id ?? `${viewId}-${index}`, 120);
  const status = safeText(item?.quickTest?.state ?? item?.live?.state ?? item?.status ?? item?.readiness ?? item?.progressTag ?? "", 40);
  const base = { id, state: status, cells: [] };
  if (viewId === "overview") return { ...base, cells: ["DevGov", "Governance workspace", "15 views", "Read-only by default"] };
  if (viewId === "service-status") {
    const controlTargetId = safeText(item.controlTargetId ?? item.id, 120);
    const actions = approvedControls
      .filter((entry) => entry.controlTargetId === controlTargetId
        && entry.approved
        && entry.status === "approved"
        && (entry.action !== "restart" || restartPolicyReady(entry.restartPolicy)))
      .map((entry) => entry.action)
      .filter((action) => action === "doctor" || action === "restart");
    return {
      ...base,
      controlTargetId,
      actions: [...new Set(actions)],
      cells: [
        safeText(item.label ?? item.id, 100),
        safeText(item.project, 80),
        status || "UNKNOWN",
        metric(item.quickTest?.latencyMs ?? item.live?.latencyMs, "ms"),
        safeText(item.quickTest?.detail ?? item.live?.detail ?? item.quickTest?.notes, 150)
      ]
    };
  }
  const cells = ({
    "service-onboarding": [item.project, item.service, item.readiness, item.reviewStatus, item.nextAction],
    "web-console-events": [item.project ?? item.source, item.level ?? item.kind, item.message ?? item.summary, item.generatedAt ?? item.timestamp],
    "registered-projects": [item.project, item.progressTag, metric(item.progressPercent, "%"), metric(item.serviceCount), list(item.tags), item.nextAction],
    "local-agents": [item.displayName ?? item.id, item.project, item.serviceId, item.status, item.healthUrl],
    "api-keys": [item.service, item.variableName, item.credentialKind, item.storageLocation, item.status],
    "storage-assets": [item.label, item.project, item.storageKind, item.readiness, item.reviewStatus],
    "agent-instructions": [item.id, item.type, item.layer, item.status, item.requirement],
    ports: [item.project, item.service, `${safeText(item.host, 80)}:${metric(item.port)}`, item.visibility, item.protocol],
    startup: [item.project, item.id, item.trigger, item.status, item.managedByCodex ? "Codex" : "Operator"],
    "public-routes": [item.hostname, item.serviceId, item.exposureClass, item.accessRequired ? "Protected" : "Public", item.status],
    "terminal-profiles": [item.name ?? item.id, item.source, item.status, item.notes],
    "web-entrypoints": [item.label, item.project, item.stage, item.exposureClass, item.status],
    "workspace-predictor": [item.id, item.type, item.layer, item.status, item.requirement]
  }[viewId] ?? [item.id, item.status, item.notes]).map((value) => safeCell(value));
  return { ...base, cells };
}

function columnsForView(viewId) {
  return ({
    overview: ["Product", "Surface", "Views", "Policy"],
    "service-status": ["Service", "Project", "State", "Latency", "Detail"],
    "service-onboarding": ["Project", "Service", "Readiness", "Review", "Next action"],
    "web-console-events": ["Source", "Level", "Message", "Observed"],
    "registered-projects": ["Project", "Progress", "%", "Services", "Tags", "Next action"],
    "local-agents": ["Agent", "Project", "Service", "Status", "Health"],
    "api-keys": ["Provider", "Variable", "Kind", "Storage", "Status"],
    "storage-assets": ["Asset", "Project", "Kind", "Readiness", "Review"],
    "agent-instructions": ["Rule", "Type", "Layer", "Status", "Requirement"],
    ports: ["Project", "Service", "Socket", "Visibility", "Protocol"],
    startup: ["Project", "Entry", "Trigger", "Status", "Owner"],
    "public-routes": ["Hostname", "Service", "Exposure", "Access", "Status"],
    "terminal-profiles": ["Profile", "Source", "Status", "Notes"],
    "web-entrypoints": ["Entrypoint", "Project", "Stage", "Exposure", "Status"],
    "workspace-predictor": ["Rule", "Type", "Layer", "Status", "Requirement"]
  }[viewId] ?? ["Item", "Status"]);
}

function metricsForView(viewId, { state = {}, serviceStatus = {}, resourceSnapshot = {} }) {
  if (viewId === "service-status") {
    const counts = countStates(serviceStatus.services ?? []);
    return [
      metricItem("Online", "正常", counts.ONLINE ?? 0, "good"),
      metricItem("Offline", "離線", counts.OFFLINE ?? 0, "neutral"),
      metricItem("Errors", "錯誤", counts.ERROR ?? 0, "bad"),
      metricItem("CPU", "CPU", metric(resourceSnapshot.host?.cpuPercent, "%"), "neutral"),
      metricItem("Memory", "記憶體", metric(resourceSnapshot.host?.memoryUsedPercent, "%"), "neutral")
    ];
  }
  const summary = state.summary ?? {};
  return [
    metricItem("Records", "項目", rowCountForView(viewId, state, serviceStatus), "neutral"),
    metricItem("Projects", "專案", summary.registeredProjects ?? 0, "neutral"),
    metricItem("Ports", "連接埠", summary.ports ?? 0, "neutral"),
    metricItem("Routes", "路由", summary.publicRoutes ?? 0, "neutral")
  ];
}

function countStates(services) {
  return services.reduce((result, item) => {
    const state = String(item.quickTest?.state ?? item.live?.state ?? "UNKNOWN").toUpperCase();
    result[state] = (result[state] ?? 0) + 1;
    return result;
  }, {});
}

function metricItem(label, labelZh, value, tone) {
  return { label, labelZh, value, tone };
}

function view(folderId, id, label, labelZh) {
  return { folderId, id, label, labelZh };
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function safeCell(value) {
  if (Array.isArray(value)) return list(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return safeText(value, 180);
}

function safeText(value, limit = 180) {
  return String(value ?? "")
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[local path]")
    .replace(/(?:sk|key|token|secret)-[A-Za-z0-9_-]{12,}/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function list(value) {
  return (Array.isArray(value) ? value : [value]).map((item) => safeText(item, 48)).filter(Boolean).slice(0, 5).join(" · ");
}

function metric(value, suffix = "") {
  const number = Number(value);
  if (Number.isFinite(number)) return `${Math.round(number * 10) / 10}${suffix}`;
  return safeText(value, 48) || "—";
}

function restartPolicyReady(policy = {}) {
  return [policy.permissionBoundary, policy.backupExpectation, policy.rollbackExpectation]
    .every((value) => typeof value === "string" && value.trim());
}
