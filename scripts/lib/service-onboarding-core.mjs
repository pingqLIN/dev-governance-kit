import { loadDashboardState } from "./dashboard-core.mjs";

export async function loadServiceOnboardingAudit(root = ".") {
  const state = await loadDashboardState(root);
  return buildServiceOnboardingAudit(state);
}

export function buildServiceOnboardingAudit(state) {
  const onboardingEntries = state.onboardingEntries ?? [];
  const portRows = state.ports
    .map((entry) => buildServiceOnboardingRow(entry, state, onboardingEntries));
  const coveredOnboardingIds = new Set(portRows.flatMap((row) => row.onboardingEntries.map((entry) => entry.id)));
  const onboardingOnlyRows = onboardingEntries
    .filter((entry) => !coveredOnboardingIds.has(entry.id))
    .map((entry) => buildOnboardingOnlyRow(entry, state))
    .filter(Boolean);
  const rows = [...portRows, ...onboardingOnlyRows]
    .sort(compareOnboardingRows);

  return {
    schema: "devgov.service-onboarding-audit.v1",
    generatedAt: new Date().toISOString(),
    summary: {
      services: rows.length,
      ready: rows.filter((row) => row.controlReadiness === "READY").length,
      partial: rows.filter((row) => row.controlReadiness === "PARTIAL").length,
      blocked: rows.filter((row) => row.controlReadiness === "BLOCKED").length,
      notApplicable: rows.filter((row) => row.controlReadiness === "NOT_APPLICABLE").length,
      registryReady: rows.filter((row) => row.registryReadiness === "READY").length,
      registryPartial: rows.filter((row) => row.registryReadiness === "PARTIAL").length,
      registryBlocked: rows.filter((row) => row.registryReadiness === "BLOCKED").length,
      registryUndeclared: rows.filter((row) => row.registryReadiness === "UNDECLARED").length,
      missingDoctor: rows.filter((row) => row.flags.missingDoctor).length,
      missingRestart: rows.filter((row) => row.flags.missingRestart).length,
      missingDashboardStatus: rows.filter((row) => row.flags.missingDashboardStatus).length
    },
    services: rows
  };
}

export function renderServiceOnboardingAudit(audit) {
  const lines = [
    "# Existing Project Service Onboarding Audit",
    "",
    `Generated: ${audit.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Services: ${audit.summary.services}`,
    `- Ready: ${audit.summary.ready}`,
    `- Partial: ${audit.summary.partial}`,
    `- Blocked: ${audit.summary.blocked}`,
    `- Control not applicable: ${audit.summary.notApplicable}`,
    `- Registry Ready: ${audit.summary.registryReady}`,
    `- Registry Partial: ${audit.summary.registryPartial}`,
    `- Registry Blocked: ${audit.summary.registryBlocked}`,
    `- Registry undeclared: ${audit.summary.registryUndeclared}`,
    `- Missing Doctor: ${audit.summary.missingDoctor}`,
    `- Missing restart governance: ${audit.summary.missingRestart}`,
    `- Missing dashboard status rows: ${audit.summary.missingDashboardStatus}`,
    ""
  ];

  for (const row of audit.services) {
    lines.push(`## ${row.project} / ${row.service}`);
    lines.push("");
    lines.push(`- Socket: \`${row.socket}\` (${row.protocol}, ${row.visibility})`);
    lines.push(`- Execution surface: \`${row.executionSurface}\``);
    lines.push(`- Registry readiness: \`${row.registryReadiness}\``);
    lines.push(`- Control readiness: \`${row.controlReadiness}\``);
    lines.push(`- Quick Test: ${row.quickTestUrl ? `\`${row.quickTestUrl}\`` : "missing"}`);
    lines.push(`- Doctor: \`${row.doctorState}\``);
    lines.push(`- Restart: \`${row.restartState}\``);
    lines.push(`- Service Status rows: ${row.serviceTargets.length}`);
    lines.push(`- Startup refs: ${row.startupRefs.length ? row.startupRefs.map((ref) => `\`${ref}\``).join(", ") : "none"}`);
    lines.push(`- Public routes: ${row.publicRoutes.length ? row.publicRoutes.map((route) => `\`${route.hostname}\``).join(", ") : "none"}`);
    lines.push(`- Local agents: ${row.localAgents.length ? row.localAgents.map((agent) => `\`${agent.displayName}\``).join(", ") : "none"}`);
    if (row.governanceOnly) {
      lines.push("- Governance-only surface: yes; DevGov has no execution or service-control authority.");
      lines.push(`- Evidence: \`${row.governance.sourceRef}\`; review: \`${row.governance.reviewEvidence}\``);
      lines.push(`- Next action: ${row.governance.nextAction}`);
      lines.push(`- Governance notes: ${row.governance.notes}`);
    }
    if (row.gaps.length) {
      lines.push("- Gaps:");
      for (const gap of row.gaps) {
        lines.push(`  - ${gap}`);
      }
    } else {
      lines.push("- Gaps: none");
    }
    if (row.nextSteps.length) {
      lines.push("- Next steps:");
      for (const step of row.nextSteps) {
        lines.push(`  - ${step}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function renderServiceOnboardingAuditZhTw(audit) {
  const lines = [
    "# 既有專案服務 Onboarding 稽核",
    "",
    `產生時間：${audit.generatedAt}`,
    "",
    "## 摘要",
    "",
    `- 服務數：${audit.summary.services}`,
    `- Control Ready：${audit.summary.ready}`,
    `- Control Partial：${audit.summary.partial}`,
    `- Control Blocked：${audit.summary.blocked}`,
    `- Control 不適用：${audit.summary.notApplicable}`,
    `- Registry Ready：${audit.summary.registryReady}`,
    `- Registry Partial：${audit.summary.registryPartial}`,
    `- Registry Blocked：${audit.summary.registryBlocked}`,
    `- Registry 未登記：${audit.summary.registryUndeclared}`,
    `- 缺少 Doctor：${audit.summary.missingDoctor}`,
    `- 缺少 Restart 治理：${audit.summary.missingRestart}`,
    `- 缺少 Dashboard status row：${audit.summary.missingDashboardStatus}`,
    ""
  ];

  for (const row of audit.services) {
    lines.push(`## ${row.project} / ${row.service}`);
    lines.push("");
    lines.push(`- Socket：\`${row.socket}\`（${row.protocol}，${row.visibility}）`);
    lines.push(`- Execution surface：\`${row.executionSurface}\``);
    lines.push(`- Registry readiness：\`${row.registryReadiness}\``);
    lines.push(`- Control readiness：\`${row.controlReadiness}\``);
    lines.push(`- Quick Test：${row.quickTestUrl ? `\`${row.quickTestUrl}\`` : "未登記"}`);
    lines.push(`- Doctor：\`${row.doctorState}\``);
    lines.push(`- Restart：\`${row.restartState}\``);
    lines.push(`- Service Status rows：${row.serviceTargets.length}`);
    lines.push(`- Startup refs：${row.startupRefs.length ? row.startupRefs.map((ref) => `\`${ref}\``).join(", ") : "無"}`);
    lines.push(`- Public routes：${row.publicRoutes.length ? row.publicRoutes.map((route) => `\`${route.hostname}\``).join(", ") : "無"}`);
    lines.push(`- Local agents：${row.localAgents.length ? row.localAgents.map((agent) => `\`${agent.displayName}\``).join(", ") : "無"}`);
    if (row.governanceOnly) {
      lines.push("- 僅治理登記：是；DevGov 沒有執行或 service-control 權限。");
      lines.push(`- 證據：\`${row.governance.sourceRef}\`；review：\`${row.governance.reviewEvidence}\``);
      lines.push(`- 下一步：${row.governance.nextAction}`);
      lines.push(`- 治理備註：${row.governance.notes}`);
    }
    if (row.gaps.length) {
      lines.push("- 缺口：");
      for (const gap of row.gaps) {
        lines.push(`  - ${localizeAuditTextZhTw(gap)}`);
      }
    } else {
      lines.push("- 缺口：無");
    }
    if (row.nextSteps.length) {
      lines.push("- 下一步：");
      for (const step of row.nextSteps) {
        lines.push(`  - ${localizeAuditTextZhTw(step)}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildServiceOnboardingRow(entry, state, onboardingEntries = []) {
  const socket = `${entry.host}:${entry.port}`;
  const publicRoutes = state.publicRoutes.filter((route) => route.localHost === entry.host && route.localPort === entry.port);
  const localAgents = state.localAgents.filter((agent) => (
    agent.portRef === `${entry.project}:${entry.service}`
    || agent.project === entry.project
  ));
  const startupEntries = state.startupEntries.filter((startup) => startup.project === entry.project);
  const serviceTargets = state.serviceTargets.filter((target) => targetMatchesEntry(target, entry, publicRoutes, localAgents));
  const matchedOnboardingEntries = onboardingEntries.filter((onboardingEntry) => onboardingEntryMatchesPortEntry(onboardingEntry, entry, publicRoutes, localAgents, serviceTargets));
  const quickTestUrl = firstNonEmpty([
    ...serviceTargets.map((target) => target.quickTest?.url),
    ...serviceTargets.map((target) => target.quickTest?.probeRef),
    ...publicRoutes.map((route) => route.healthUrl),
    ...localAgents.map((agent) => agent.healthUrl)
  ]);
  const doctorState = aggregatePresenceState(serviceTargets.map((target) => target.doctor?.state));
  const restartState = aggregateRestartState(serviceTargets.map((target) => target.restart?.state), startupEntries.length > 0);
  const readiness = aggregateReadiness(serviceTargets.map((target) => target.controlReadiness), quickTestUrl, doctorState, restartState);
  const registryReadiness = aggregateRegistryReadiness(matchedOnboardingEntries);
  const executionSurface = matchedOnboardingEntries.some((onboardingEntry) => onboardingEntry.id === "lm-studio-local-runtime")
    ? "local-runtime"
    : "local-service";
  const gaps = [];
  const nextSteps = [];

  if (serviceTargets.length === 0) {
    gaps.push("Not surfaced in dashboard Service Status yet.");
    nextSteps.push("Add a stable service-status mapping so this registry entry appears in the dashboard.");
  }
  if (!quickTestUrl) {
    gaps.push("Missing reviewed health URL for Quick Test.");
    nextSteps.push("Register a loopback or public health URL so the dashboard can run a safe check.");
  }
  if (doctorState !== "FOUND") {
    gaps.push("Missing registered Doctor mechanism.");
    nextSteps.push("Add `doctor` and optional `doctor:repair` entry points, then register the stable reference.");
  }
  if (restartState === "MISSING") {
    gaps.push("Missing stable startup or restart governance reference.");
    nextSteps.push("Register a reviewed startup or on-demand start path in `registry/startup.registry.json`.");
  } else if (restartState === "REVIEW_REQUIRED") {
    gaps.push("Restart reference exists but dashboard-safe execution is still review-gated.");
    nextSteps.push("Keep restart disabled in the dashboard until command boundaries and rollback expectations are reviewed.");
  }
  if (entry.visibility === "public" && publicRoutes.length === 0) {
    gaps.push("Public-facing registry entry has no corresponding public-route record.");
    nextSteps.push("Verify whether this service still needs a public route and register it in `registry/public-routes.registry.json` if yes.");
  }

  const quickLinks = buildQuickLinks({
    quickTestUrl,
    doctorRefs: unique(serviceTargets.map((target) => target.doctor?.ref).filter(Boolean)),
    restartRefs: unique(serviceTargets.map((target) => target.restart?.ref).filter(Boolean)),
    publicRoutes,
    startupEntries
  });

  return {
    id: `${entry.project}:${entry.service}`,
    project: entry.project,
    service: entry.service,
    socket,
    host: entry.host,
    port: entry.port,
    protocol: entry.protocol,
    visibility: entry.visibility,
    executionSurface,
    readiness,
    controlReadiness: readiness,
    registryReadiness,
    onboardingEntries: matchedOnboardingEntries.map((onboardingEntry) => ({
      id: onboardingEntry.id,
      readiness: onboardingEntry.readiness,
      reviewStatus: onboardingEntry.reviewStatus,
      ownerKind: onboardingEntry.ownerKind,
      sourceRef: onboardingEntry.sourceRef,
      reviewEvidence: onboardingEntry.reviewEvidence,
      nextAction: onboardingEntry.nextAction,
      notes: onboardingEntry.notes
    })),
    doctorState,
    restartState,
    quickTestUrl: quickTestUrl ?? "",
    serviceTargets: serviceTargets.map((target) => target.id),
    startupRefs: startupEntries.map((startup) => startup.scriptRef),
    publicRoutes: publicRoutes.map((route) => ({ id: route.id, hostname: route.hostname, healthUrl: route.healthUrl })),
    localAgents: localAgents.map((agent) => ({ id: agent.id, displayName: agent.displayName })),
    gaps,
    nextSteps,
    quickLinks,
    flags: {
      missingDoctor: doctorState !== "FOUND",
      missingRestart: restartState === "MISSING",
      missingDashboardStatus: serviceTargets.length === 0
    }
  };
}

function targetMatchesEntry(target, entry, publicRoutes, localAgents) {
  const socket = `${entry.host}:${entry.port}`;
  if (target.target === socket) return true;
  if (target.project === entry.project && target.service === entry.service) return true;
  if (publicRoutes.some((route) => `public-route:${route.id}` === target.id)) return true;
  if (localAgents.some((agent) => `local-agent:${agent.id}` === target.id)) return true;
  return false;
}

function buildOnboardingOnlyRow(entry, state) {
  const serviceTargets = state.serviceTargets.filter((target) => target.id === `onboarding:${entry.id}`);
  if (serviceTargets.length === 0) return null;
  const governanceOnly = serviceTargets.every((target) => target.governanceOnly === true);
  const quickTestUrl = firstNonEmpty([
    ...serviceTargets.map((target) => target.quickTest?.url),
    ...serviceTargets.map((target) => target.quickTest?.probeRef)
  ]);
  const doctorState = aggregatePresenceState(serviceTargets.map((target) => target.doctor?.state));
  const restartState = aggregateRestartState(serviceTargets.map((target) => target.restart?.state), false);
  const readiness = aggregateReadiness(serviceTargets.map((target) => target.controlReadiness), quickTestUrl, doctorState, restartState);
  const gaps = [];
  const nextSteps = [];

  if (!governanceOnly && !quickTestUrl) {
    gaps.push("Missing reviewed Quick Test URL or probe reference.");
    nextSteps.push("Register a safe URL or local probe so this non-port governance item can be checked.");
  }
  if (doctorState === "MISSING") {
    gaps.push("Missing registered Doctor mechanism.");
    nextSteps.push("Add a reviewed Doctor wrapper and register the stable reference.");
  }
  if (restartState === "MISSING") {
    gaps.push("Missing stable startup or restart governance reference.");
    nextSteps.push("Register a reviewed startup or reset path, or mark it explicitly not applicable.");
  }

  return {
    id: entry.id,
    project: serviceTargets[0].project,
    service: entry.service ?? serviceTargets[0].controlTargetId ?? entry.id,
    socket: serviceTargets[0].target,
    host: "",
    port: null,
    protocol: entry.protocol ?? serviceTargets[0].executionSurface ?? "non-port",
    visibility: entry.visibility ?? serviceTargets[0].visibility ?? "local",
    executionSurface: serviceTargets[0].executionSurface ?? "governance-record",
    readiness,
    controlReadiness: readiness,
    registryReadiness: entry.readiness ?? "UNDECLARED",
    onboardingEntries: [{
      id: entry.id,
      readiness: entry.readiness,
      reviewStatus: entry.reviewStatus,
      ownerKind: entry.ownerKind,
      sourceRef: entry.sourceRef,
      reviewEvidence: entry.reviewEvidence,
      nextAction: entry.nextAction,
      notes: entry.notes
    }],
    governanceOnly,
    governance: {
      ownerKind: entry.ownerKind,
      sourceRef: entry.sourceRef,
      reviewEvidence: entry.reviewEvidence,
      nextAction: entry.nextAction,
      notes: entry.notes
    },
    doctorState,
    restartState,
    quickTestUrl: quickTestUrl ?? "",
    serviceTargets: serviceTargets.map((target) => target.id),
    startupRefs: [],
    publicRoutes: [],
    localAgents: [],
    gaps,
    nextSteps,
    quickLinks: buildQuickLinks({
      quickTestUrl,
      doctorRefs: unique(serviceTargets.map((target) => target.doctor?.ref).filter(Boolean)),
      restartRefs: unique(serviceTargets.map((target) => target.restart?.ref).filter(Boolean)),
      publicRoutes: [],
      startupEntries: []
    }),
    flags: {
      missingDoctor: doctorState === "MISSING",
      missingRestart: restartState === "MISSING",
      missingDashboardStatus: false
    }
  };
}

function onboardingEntryMatchesPortEntry(onboardingEntry, portEntry, publicRoutes, localAgents, serviceTargets) {
  if (onboardingEntry.sourceRef === `registry/ports.registry.json#${portEntry.project}:${portEntry.service}`) return true;
  if (publicRoutes.some((route) => onboardingEntry.sourceRef === `registry/public-routes.registry.json#${route.id}`)) return true;
  if (localAgents.some((agent) => onboardingEntry.sourceRef === `registry/local-agents.registry.json#${agent.id}`)) return true;
  if (serviceTargets.some((target) => target.id === `onboarding:${onboardingEntry.id}`)) return true;
  return false;
}

function buildQuickLinks({ quickTestUrl, doctorRefs, restartRefs, publicRoutes, startupEntries }) {
  const links = [];
  if (quickTestUrl) {
    links.push({ label: "Health", type: "url", target: quickTestUrl });
  }
  for (const ref of doctorRefs) {
    links.push({ label: "Doctor", type: "ref", target: ref });
  }
  for (const ref of restartRefs) {
    links.push({ label: "Restart", type: "ref", target: ref });
  }
  for (const route of publicRoutes) {
    links.push({ label: "Route", type: "url", target: `https://${route.hostname}` });
  }
  if (startupEntries.length > 0) {
    links.push({ label: "Startup registry", type: "ref", target: "registry/startup.registry.json" });
  }
  return uniqueBy(links, (link) => `${link.label}:${link.type}:${link.target}`);
}

function aggregatePresenceState(states) {
  if (states.includes("FOUND")) return "FOUND";
  if (states.includes("NOT_APPLICABLE")) return "NOT_APPLICABLE";
  return "MISSING";
}

function aggregateRestartState(states, hasStartupEntries) {
  if (states.includes("FOUND")) return "FOUND";
  if (states.includes("REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  if (states.includes("NOT_APPLICABLE")) return "NOT_APPLICABLE";
  if (states.includes("DISABLED")) return "DISABLED";
  return hasStartupEntries ? "REVIEW_REQUIRED" : "MISSING";
}

function aggregateReadiness(states, quickTestUrl, doctorState, restartState) {
  if (states.includes("READY")) return "READY";
  if (states.includes("PARTIAL")) return "PARTIAL";
  if (states.includes("NOT_APPLICABLE")) return "NOT_APPLICABLE";
  if (quickTestUrl && (doctorState === "FOUND" || ["FOUND", "REVIEW_REQUIRED"].includes(restartState))) return "PARTIAL";
  return "BLOCKED";
}

function aggregateRegistryReadiness(entries) {
  const states = entries.map((entry) => entry.readiness).filter(Boolean);
  if (states.includes("BLOCKED")) return "BLOCKED";
  if (states.includes("PARTIAL")) return "PARTIAL";
  if (states.includes("READY")) return "READY";
  return "UNDECLARED";
}

function compareOnboardingRows(left, right) {
  const rank = new Map([
    ["BLOCKED", 0],
    ["PARTIAL", 1],
    ["READY", 2],
    ["NOT_APPLICABLE", 3]
  ]);
  return (rank.get(left.readiness) ?? 9) - (rank.get(right.readiness) ?? 9)
    || left.project.localeCompare(right.project)
    || left.service.localeCompare(right.service);
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstNonEmpty(values) {
  return values.find((value) => typeof value === "string" && value.trim());
}

function localizeAuditTextZhTw(text) {
  const translations = new Map([
    ["Not surfaced in dashboard Service Status yet.", "尚未出現在 Dashboard Service Status。"],
    ["Add a stable service-status mapping so this registry entry appears in the dashboard.", "新增穩定的 service-status mapping，讓此 registry entry 顯示於 Dashboard。"],
    ["Missing reviewed health URL for Quick Test.", "缺少已 review 的 Quick Test health URL。"],
    ["Register a loopback or public health URL so the dashboard can run a safe check.", "登記 loopback 或 public health URL，讓 Dashboard 能執行安全檢查。"],
    ["Missing registered Doctor mechanism.", "缺少已登記的 Doctor 機制。"],
    ["Add `doctor` and optional `doctor:repair` entry points, then register the stable reference.", "新增 `doctor` 與選用的 `doctor:repair` entry point，再登記穩定 reference。"],
    ["Add a reviewed Doctor wrapper and register the stable reference.", "新增已 review 的 Doctor wrapper，並登記穩定 reference。"],
    ["Missing stable startup or restart governance reference.", "缺少穩定的 startup 或 Restart 治理 reference。"],
    ["Register a reviewed startup or on-demand start path in `registry/startup.registry.json`.", "在 `registry/startup.registry.json` 登記已 review 的 startup 或 on-demand start path。"],
    ["Register a reviewed startup or reset path, or mark it explicitly not applicable.", "登記已 review 的 startup 或 reset path，或明確標示不適用。"],
    ["Restart reference exists but dashboard-safe execution is still review-gated.", "Restart reference 已存在，但 Dashboard 安全執行仍受 review gate 約束。"],
    ["Keep restart disabled in the dashboard until command boundaries and rollback expectations are reviewed.", "在 command boundary 與 rollback expectation 完成 review 前，維持 Dashboard Restart 停用。"],
    ["Public-facing registry entry has no corresponding public-route record.", "Public-facing registry entry 沒有對應的 public-route record。"],
    ["Verify whether this service still needs a public route and register it in `registry/public-routes.registry.json` if yes.", "確認此服務是否仍需要 public route；若需要，登記至 `registry/public-routes.registry.json`。"],
    ["Missing reviewed Quick Test URL or probe reference.", "缺少已 review 的 Quick Test URL 或 probe reference。"],
    ["Register a safe URL or local probe so this non-port governance item can be checked.", "登記安全 URL 或 local probe，讓此 non-port governance item 可被檢查。"]
  ]);
  return translations.get(text) ?? text;
}
