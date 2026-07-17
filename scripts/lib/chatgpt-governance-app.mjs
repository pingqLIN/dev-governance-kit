import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { checkServiceStatuses, loadDashboardState } from "./dashboard-core.mjs";
import { buildResourceCoordinationSnapshot } from "./resource-coordination-core.mjs";

export const GOVERNANCE_PANEL_RESOURCE_URI = "ui://devgov/governance-pulse.html";

export function buildGovernancePulse({ state, serviceStatus, resourceSnapshot }) {
  const services = Array.isArray(serviceStatus?.services) ? serviceStatus.services : [];
  const serviceCounts = countByState(services, (service) => service.quickTest?.state ?? service.live?.state ?? "UNKNOWN");
  const exceptions = services
    .filter((service) => ["OFFLINE", "ERROR"].includes(service.quickTest?.state ?? service.live?.state))
    .map((service) => ({
      id: service.id,
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
    links: {
      dashboard: state?.app?.url ?? "http://127.0.0.1:3000"
    }
  };
}

export async function loadGovernancePulse(root = ".", options = {}) {
  const [state, serviceStatus, resourceSnapshot] = await Promise.all([
    loadDashboardState(root),
    checkServiceStatuses(root, { timeoutMs: options.timeoutMs ?? 1400 }),
    buildResourceCoordinationSnapshot(root, { sampleMs: options.sampleMs ?? 50, includeProcessFamilies: false })
  ]);
  return buildGovernancePulse({ state, serviceStatus, resourceSnapshot });
}

export function createGovernanceAppServer(root = ".") {
  const server = new McpServer({ name: "devgov-governance-panel", version: "0.1.0" });
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
    _meta: { ui: { resourceUri: GOVERNANCE_PANEL_RESOURCE_URI, visibility: ["app"] } }
  }, getPulse);

  return server;
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
:root{color-scheme:light dark;--bg:var(--color-background-primary,#fff);--panel:var(--color-background-secondary,#f7f7f7);--ink:var(--color-text-primary,#171717);--muted:var(--color-text-secondary,#6b6b6b);--line:var(--color-border-secondary,rgba(127,127,127,.2));--good:#16835b;--warn:#b56b00;--bad:#c43a3a;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}button{font:inherit;color:inherit}.shell{max-width:900px;margin:auto;padding:18px 18px calc(22px + env(safe-area-inset-bottom))}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.eyebrow{margin:0 0 5px;color:var(--muted);font-size:12px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}.title{margin:0;font-size:clamp(22px,4vw,34px);letter-spacing:-.035em}.summary{margin:8px 0 0;color:var(--muted);font-size:14px}.pulse{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:700;white-space:nowrap}.dot{width:8px;height:8px;border-radius:50%;background:var(--warn)}.HEALTHY .dot{background:var(--good)}.DEGRADED .dot{background:var(--bad)}.metrics{display:grid;grid-template-columns:1.25fr repeat(3,1fr);gap:1px;margin:22px 0;background:var(--line);border:1px solid var(--line);border-radius:15px;overflow:hidden}.metric{min-height:108px;background:var(--bg);padding:16px}.metric strong{display:block;font-size:27px;letter-spacing:-.04em}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:12px;line-height:1.35}.metric.primary{background:var(--panel)}.section{border-top:1px solid var(--line);padding:18px 0}.section-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px}.section h2{margin:0;font-size:15px}.section small{color:var(--muted)}.rows{display:grid;gap:8px}.row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border-radius:11px;background:var(--panel)}.row-mark{width:7px;height:7px;border-radius:50%;background:var(--bad)}.row strong{display:block;font-size:13px}.row span{display:block;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row code{color:var(--muted);font-size:11px}.empty{color:var(--muted);font-size:13px;padding:8px 0}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.action{min-height:38px;border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:8px 12px;cursor:pointer}.action.primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}.action:disabled{opacity:.55;cursor:wait}.meta{margin-top:12px;color:var(--muted);font-size:11px}
@media(max-width:620px){.shell{padding:14px 14px calc(18px + env(safe-area-inset-bottom))}.top{display:block}.pulse{display:inline-flex;margin-top:14px}.metrics{grid-template-columns:1fr 1fr}.metric{min-height:92px;padding:13px}.metric.primary{grid-column:1/-1}.section{padding:15px 0}.row{grid-template-columns:9px minmax(0,1fr)}.row code{display:none}.action{flex:1}.pip-action{display:none}}
@media(prefers-reduced-motion:no-preference){.dot{animation:breathe 2.4s ease-in-out infinite}@keyframes breathe{50%{transform:scale(1.35);opacity:.65}}}
</style></head><body><main class="shell"><div class="top"><div><p class="eyebrow" id="eyebrow">DevGov · read only</p><h1 class="title" id="title">Governance Pulse</h1><p class="summary" id="summary">Loading the latest high-value signals…</p></div><div class="pulse ATTENTION" id="pulse"><span class="dot"></span><span id="state">Loading</span></div></div><section class="metrics" id="metrics"></section><section class="section"><div class="section-head"><h2 id="attention-title">Needs attention</h2><small id="exception-count"></small></div><div class="rows" id="exceptions"></div></section><section class="section"><div class="section-head"><h2 id="capacity-title">Shared capacity</h2><small id="freshness"></small></div><div class="rows" id="capacity"></div></section><div class="actions"><button class="action primary" id="refresh">Refresh</button><button class="action" id="fullscreen">Full screen</button><button class="action pip-action" id="pip">Pin</button></div><div class="meta" id="meta"></div></main>
<script>
const $=id=>document.getElementById(id);let pulse=window.openai?.toolOutput||null;
const zh=/^zh/i.test(window.openai?.locale||navigator.language||"");const copy=zh?{eyebrow:"DevGov · 唯讀",title:"治理脈動",loading:"正在讀取高價值治理訊號…",healthy:"治理訊號正常。",attention:"部分訊號需要重新確認。",degraded:"有高價值例外需要處理。",attentionTitle:"需要留意",capacityTitle:"共用資源",online:"服務正常／已檢查",projects:"受治理專案",routes:"受保護路由",memory:"主機記憶體",clear:"目前沒有高價值例外。",refresh:"重新整理",refreshing:"更新中…",fullscreen:"全螢幕",pin:"釘選",updated:"更新時間"}:{eyebrow:"DevGov · read only",title:"Governance Pulse",loading:"Loading the latest high-value signals…",healthy:"Governance signals are nominal.",attention:"Some signals need a fresh check.",degraded:"High-value exceptions need attention.",attentionTitle:"Needs attention",capacityTitle:"Shared capacity",online:"services online among checked targets",projects:"registered projects",routes:"protected public routes",memory:"host memory",clear:"No high-value exceptions in the latest snapshot.",refresh:"Refresh",refreshing:"Refreshing…",fullscreen:"Full screen",pin:"Pin",updated:"Updated"};$("eyebrow").textContent=copy.eyebrow;$("title").textContent=copy.title;$("summary").textContent=copy.loading;$("attention-title").textContent=copy.attentionTitle;$("capacity-title").textContent=copy.capacityTitle;$("refresh").textContent=copy.refresh;$("fullscreen").textContent=copy.fullscreen;$("pip").textContent=copy.pin;
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function render(data){if(!data||data.schema!=="devgov.governance-pulse.v1")return;pulse=data;$("summary").textContent=data.overallState==="HEALTHY"?copy.healthy:data.overallState==="ATTENTION"?copy.attention:copy.degraded;$("state").textContent=data.overallState;$("pulse").className="pulse "+data.overallState;const checked=data.services.online+data.services.offline+data.services.errors;$("metrics").innerHTML='<div class="metric primary"><strong>'+safe(data.services.online)+'/'+safe(checked)+'</strong><span>'+copy.online+'</span></div><div class="metric"><strong>'+safe(data.governance.registeredProjects)+'</strong><span>'+copy.projects+'</span></div><div class="metric"><strong>'+safe(data.governance.protectedRoutes)+'</strong><span>'+copy.routes+'</span></div><div class="metric"><strong>'+safe(data.coordination.memoryPercent??"—")+'%</strong><span>'+copy.memory+' · '+safe(data.coordination.state)+'</span></div>';const issues=[...(data.exceptions||[]),...(data.registryErrors||[]).map((detail,i)=>({id:"registry-"+i,label:"Registry validation",project:"DevGov",state:"ERROR",detail}))];$("exception-count").textContent=issues.length?String(issues.length):"✓";$("exceptions").innerHTML=issues.length?issues.map(item=>'<div class="row"><span class="row-mark"></span><div><strong>'+safe(item.label)+'</strong><span>'+safe(item.project)+' · '+safe(item.detail)+'</span></div><code>'+safe(item.state)+'</code></div>').join(""):'<div class="empty">'+copy.clear+'</div>';$("capacity").innerHTML='<div class="row"><span class="row-mark" style="background:'+(data.coordination.state==="NOMINAL"?"var(--good)":"var(--warn)")+'"></span><div><strong>'+safe(data.coordination.state)+'</strong><span>CPU '+safe(data.coordination.cpuPercent??"—")+'% · memory '+safe(data.coordination.memoryPercent??"—")+'%</span></div><code>LIVE</code></div>';$("freshness").textContent=data.coordination.expiresAt?new Date(data.coordination.expiresAt).toLocaleTimeString():"snapshot";$("meta").textContent=copy.updated+" "+new Date(data.generatedAt).toLocaleString();window.openai?.setWidgetState?.({lastView:"pulse",lastRefresh:data.generatedAt});}
window.addEventListener("openai:set_globals",e=>{const next=e.detail?.globals?.toolOutput??window.openai?.toolOutput;if(next)render(next)});$("refresh").onclick=async()=>{const b=$("refresh");b.disabled=true;b.textContent=copy.refreshing;try{const result=await window.openai?.callTool?.("refresh_governance_pulse",{});render(result?.structuredContent??window.openai?.toolOutput)}finally{b.disabled=false;b.textContent=copy.refresh}};$("fullscreen").onclick=()=>window.openai?.requestDisplayMode?.({mode:"fullscreen"});$("pip").onclick=()=>window.openai?.requestDisplayMode?.({mode:"pip"});if(pulse)render(pulse);
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
