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
      ready: rows.filter((row) => row.readiness === "READY").length,
      partial: rows.filter((row) => row.readiness === "PARTIAL").length,
      blocked: rows.filter((row) => row.readiness === "BLOCKED").length,
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
    lines.push(`- Registry readiness: \`${row.registryReadiness}\``);
    lines.push(`- Control readiness: \`${row.readiness}\``);
    lines.push(`- Quick Test: ${row.quickTestUrl ? `\`${row.quickTestUrl}\`` : "missing"}`);
    lines.push(`- Doctor: \`${row.doctorState}\``);
    lines.push(`- Restart: \`${row.restartState}\``);
    lines.push(`- Service Status rows: ${row.serviceTargets.length}`);
    lines.push(`- Startup refs: ${row.startupRefs.length ? row.startupRefs.map((ref) => `\`${ref}\``).join(", ") : "none"}`);
    lines.push(`- Public routes: ${row.publicRoutes.length ? row.publicRoutes.map((route) => `\`${route.hostname}\``).join(", ") : "none"}`);
    lines.push(`- Local agents: ${row.localAgents.length ? row.localAgents.map((agent) => `\`${agent.displayName}\``).join(", ") : "none"}`);
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
    readiness,
    registryReadiness,
    onboardingEntries: matchedOnboardingEntries.map((onboardingEntry) => ({
      id: onboardingEntry.id,
      readiness: onboardingEntry.readiness,
      reviewStatus: onboardingEntry.reviewStatus
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
  const quickTestUrl = firstNonEmpty([
    ...serviceTargets.map((target) => target.quickTest?.url),
    ...serviceTargets.map((target) => target.quickTest?.probeRef)
  ]);
  const doctorState = aggregatePresenceState(serviceTargets.map((target) => target.doctor?.state));
  const restartState = aggregateRestartState(serviceTargets.map((target) => target.restart?.state), false);
  const readiness = aggregateReadiness(serviceTargets.map((target) => target.controlReadiness), quickTestUrl, doctorState, restartState);
  const gaps = [];
  const nextSteps = [];

  if (!quickTestUrl) {
    gaps.push("Missing reviewed Quick Test URL or probe reference.");
    nextSteps.push("Register a safe URL or local probe so this non-port governance item can be checked.");
  }
  if (doctorState !== "FOUND") {
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
    protocol: entry.protocol ?? "non-port",
    visibility: entry.visibility ?? "local",
    readiness,
    registryReadiness: entry.readiness ?? "UNDECLARED",
    onboardingEntries: [{ id: entry.id, readiness: entry.readiness, reviewStatus: entry.reviewStatus }],
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
      missingDoctor: doctorState !== "FOUND",
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
    ["READY", 2]
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
