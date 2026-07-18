export function renderGovernancePanelHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{color-scheme:light;--host-bg:#f7f7f5;--surface:var(--color-background-primary,var(--host-bg));--surface-2:var(--color-background-secondary,rgba(23,23,23,.045));--ink:var(--color-text-primary,#171717);--muted:var(--color-text-secondary,#6f6f6f);--line:var(--color-border-secondary,rgba(23,23,23,.14));--focus:#3977d4;--good:#16845b;--warn:#9a6513;--bad:#bd3e3e;--host-safe-bottom:0px;font-family:var(--font-sans,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif)}
:root[data-theme="dark"]{color-scheme:dark;--host-bg:#212121;--surface:var(--color-background-primary,var(--host-bg));--surface-2:var(--color-background-secondary,rgba(255,255,255,.065));--ink:var(--color-text-primary,#f2f2f2);--muted:var(--color-text-secondary,#b4b4b4);--line:var(--color-border-secondary,rgba(255,255,255,.15));--focus:#73a6ee;--good:#4ab88a;--warn:#d0a24e;--bad:#eb7777}
*{box-sizing:border-box;min-width:0}
html,body{margin:0;background:var(--surface);color:var(--ink);overflow:hidden}
body{font-size:13px;line-height:1.4}
.shell{height:620px;min-height:0;padding:8px 2px calc(8px + var(--host-safe-bottom) + env(safe-area-inset-bottom));background:inherit}
.frame{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:7px}
.toolbar{min-height:42px;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--line)}
.brand{font-weight:680;letter-spacing:-.015em}
.crumb{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:12px}
.crumb strong{color:var(--ink);font-weight:620}
.toolbar-actions{margin-left:auto;display:flex;align-items:center;gap:4px}
.icon-button,.button,.view-button,.chip{min-height:44px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--ink);padding:7px 10px;font:inherit;font-weight:560;cursor:pointer}
.icon-button{min-width:44px;padding:7px}
.button{border-color:var(--line)}
.button:hover,.icon-button:hover,.view-button:hover{background:var(--surface-2)}
.button.primary{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.button.danger{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.stage{position:relative;min-height:0;perspective:920px;perspective-origin:56% 42%;isolation:isolate}
.depth-scene{position:absolute;inset:0;transform-style:preserve-3d;transform-origin:56% 48%;will-change:transform}
.depth-dock{position:absolute;z-index:6;left:0;top:24px;bottom:24px;width:44px;height:330px;max-height:calc(100% - 48px);margin-block:auto;padding:12px 0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:1px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scroll-behavior:smooth;scrollbar-width:none;-ms-overflow-style:none;touch-action:pan-y;perspective:520px;background:linear-gradient(to bottom,transparent,var(--line) 8%,var(--line) 92%,transparent) 17px 7px/1px calc(100% - 14px) no-repeat}
.depth-dock::-webkit-scrollbar{display:none}
.depth-dock,.depth-dock .view-button{cursor:grab;-webkit-user-drag:none}
.depth-dock[data-dragging="true"],.depth-dock[data-dragging="true"] .view-button{cursor:grabbing;user-select:none}
.view-button{position:relative;flex:0 0 26px;width:38px;min-height:26px;height:26px;display:grid;place-items:center;padding:0 3px;border-color:transparent;border-radius:7px;color:var(--muted);font-size:9px;font-variant-numeric:tabular-nums;letter-spacing:.025em;opacity:var(--depth-opacity,1);transform:translate3d(var(--depth-shift,0),0,var(--depth-z,0)) scale(var(--depth-scale,1));transform-origin:left center;transition:transform 160ms ease,opacity 160ms ease,background-color 160ms ease,border-color 160ms ease,color 160ms ease}
.view-button[data-group-start="true"]{margin-top:5px}
.view-button::before{content:"";position:absolute;left:3px;width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.45}
.view-button[aria-selected="true"]{z-index:2;width:42px;border-color:var(--line);background:var(--surface);box-shadow:0 4px 12px rgba(0,0,0,.08);color:var(--ink);opacity:1;transform:translate3d(5px,0,12px) scale(1.04)}
.view-button[aria-selected="true"]::before{background:var(--focus);opacity:1}
.depth-index{margin-left:6px}
.transition-stack{position:absolute;inset:0;z-index:1;pointer-events:none;transform-style:preserve-3d}
.transition-sheet,.preview-sheet,.active-sheet{position:absolute;border:1px solid var(--line);border-radius:12px;background:var(--surface);backface-visibility:hidden}
.transition-sheet{inset:22px 12px 0 28px;opacity:0;overflow:hidden;transform-origin:center center;box-shadow:0 8px 22px rgba(0,0,0,.09);will-change:transform,opacity}
.transition-sheet::before{content:"";position:absolute;left:16px;right:16px;top:33px;height:1px;background:var(--line);box-shadow:0 38px 0 color-mix(in srgb,var(--line) 72%,transparent),0 76px 0 color-mix(in srgb,var(--line) 52%,transparent)}
.transition-sheet::after{content:"";position:absolute;left:16px;top:48px;width:min(48%,260px);height:5px;border-radius:999px;background:var(--surface-2);box-shadow:0 38px 0 var(--surface-2),0 76px 0 var(--surface-2)}
.transition-sheet-label{position:absolute;left:16px;top:9px;color:var(--muted);font-size:10px;font-weight:620;letter-spacing:-.01em}
.transition-sheet-depth{position:absolute;right:14px;top:9px;color:var(--muted);font-size:9px;font-variant-numeric:tabular-nums}
.transition-sheet[data-target="true"]{border-color:color-mix(in srgb,var(--focus) 38%,var(--line))}
.preview-sheet{inset:14px 5px 5px 38px;pointer-events:none;transform-origin:center top}
.preview-sheet.one{transform:translate3d(11px,-6px,-26px) scale(.978);opacity:.62;box-shadow:0 5px 14px rgba(0,0,0,.05);z-index:1}
.preview-sheet.two{transform:translate3d(20px,-11px,-52px) scale(.956);opacity:.3;z-index:0}
.preview-sheet span{position:absolute;right:14px;top:7px;color:var(--muted);font-size:9px;font-variant-numeric:tabular-nums}
.active-sheet{inset:22px 12px 0 28px;z-index:2;display:block;box-shadow:0 7px 20px rgba(0,0,0,.075);overflow:clip;transform-origin:center center;will-change:transform,opacity,filter}
.stage[data-depth-phase] .preview-sheet{opacity:0}
.stage[data-depth-phase] .active-sheet{box-shadow:0 18px 44px rgba(0,0,0,.13)}
.active-sheet[data-loading="true"] .workspace{opacity:.72}
.workspace{height:100%;min-height:0;padding:12px 14px 9px 20px;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;gap:8px;transition:opacity 120ms ease}
.workspace[data-predictor="true"]{grid-template-rows:auto auto auto auto minmax(0,1fr) auto}
.view-head{display:flex;align-items:center;gap:8px}
.view-head h1{margin:0;font-size:15px;letter-spacing:-.015em}
.state-pill{border:1px solid color-mix(in srgb,var(--warn) 35%,var(--line));border-radius:999px;padding:3px 8px;color:var(--warn);background:color-mix(in srgb,var(--warn) 9%,transparent);font-size:10px;font-weight:700;letter-spacing:.04em}
.updated{margin-left:auto;color:var(--muted);font-size:10px}
.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.metric{padding:7px 8px;border:1px solid var(--line);border-radius:8px}
.metric dt{color:var(--muted);font-size:9px;text-transform:uppercase}
.metric dd{margin:2px 0 0;font-size:16px;font-weight:680}
.metric[data-tone="good"] dd{color:var(--good)}
.metric[data-tone="bad"] dd{color:var(--bad)}
.view-tools{display:flex;align-items:center;gap:5px}
.search{height:44px;flex:1;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);padding:8px 10px;font:inherit}
.view-select{display:none;height:44px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);padding:7px}
.table-wrap{min-height:0;border:1px solid var(--line);border-radius:8px;overflow:clip}
.data-table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
.data-table th,.data-table td{height:34px;padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}
.data-table th{height:30px;color:var(--muted);font-weight:560;background:var(--surface-2)}
.data-table tr:last-child td{border-bottom:0}
.data-table td:first-child{font-size:11px;font-weight:590}
.data-table .actions-cell{width:112px}
.row-state{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:var(--muted)}
.row-state.ONLINE,.row-state.READY,.row-state.APPROVED{background:var(--good)}
.row-state.ERROR,.row-state.BLOCKED{background:var(--bad)}
.row-state.OFFLINE,.row-state.PARTIAL,.row-state.CANDIDATE{background:var(--warn)}
.row-actions{display:flex;justify-content:flex-end;gap:4px}
.row-actions .button{min-height:30px;padding:4px 7px;font-size:10px}
.footer{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:10px}
.footer .pager{margin-left:auto;display:flex;align-items:center;gap:5px}
.footer .button{min-height:32px;padding:4px 8px;font-size:10px}
.predictor{display:none;grid-template-columns:minmax(0,1fr) auto auto;gap:5px}
.predictor[data-active="true"]{display:grid}
.prediction-result{grid-column:1/-1;min-height:30px;padding:6px 8px;border-left:2px solid var(--line);color:var(--muted);font-size:10px}
.prediction-result[data-state="READY"]{border-color:var(--good)}
.prediction-result[data-state="BLOCKED"]{border-color:var(--bad)}
.dialog-backdrop{position:absolute;inset:0;z-index:9;display:grid;place-items:center;background:rgba(0,0,0,.18);padding:20px}
.dialog{width:min(440px,100%);border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 18px 50px rgba(0,0,0,.2);padding:16px}
.dialog h2{margin:0 0 7px;font-size:15px}
.dialog p{margin:0;color:var(--muted);font-size:12px}
.dialog .row-actions{margin-top:14px}
.operation{border-left:2px solid var(--line);padding-left:8px}
.operation[data-state="completed"]{border-color:var(--good)}
.operation[data-state="failed"]{border-color:var(--bad)}
.empty-cell{text-align:center!important;color:var(--muted)!important}
.host-note{padding:0 4px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[hidden]{display:none!important}
:root[data-display-mode="fullscreen"] .shell{height:720px;max-width:1180px;margin-inline:auto;padding-inline:12px}
:root[data-display-mode="fullscreen"] .active-sheet{right:6px}
@media(max-width:720px){.crumb .secondary,.toolbar-actions .secondary{display:none}.active-sheet{right:6px}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.metric:nth-child(n+4){display:none}.data-table th:nth-child(n+5),.data-table td:nth-child(n+5){display:none}}
@media(max-width:540px){.depth-dock,.preview-sheet{display:none}.active-sheet,.transition-sheet{inset:8px 5px 0 0}.view-select{display:block;max-width:42%}.workspace{padding:10px 9px 9px}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.data-table th:nth-child(n+4),.data-table td:nth-child(n+4){display:none}.data-table th.actions-cell,.data-table td.actions-cell{display:table-cell}.toolbar-actions .theme-toggle{display:none}}
@media(max-width:340px){.brand{display:none}.view-tools{display:grid;grid-template-columns:1fr auto}.view-select{display:block;max-width:none;grid-column:1/-1}.search{grid-column:1/-1}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:nth-child(3){display:none}.data-table .actions-cell{width:104px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}.transition-stack{display:none!important}}
</style>
</head>
<body>
<main class="shell">
  <div class="frame">
    <header class="toolbar">
      <span class="brand">DevGov</span>
      <span class="crumb"><span>›</span><strong id="folder-crumb">Pulse</strong><span>›</span><strong id="view-crumb">Service Status</strong><span class="secondary" id="depth-crumb">z04</span></span>
      <div class="toolbar-actions">
        <button class="icon-button secondary" id="back" type="button" aria-label="Back">‹</button>
        <button class="icon-button" id="refresh" type="button" aria-label="Refresh">↻</button>
        <button class="icon-button theme-toggle" id="light" type="button" aria-label="Light theme">☼</button>
        <button class="icon-button theme-toggle" id="dark" type="button" aria-label="Dark theme">☾</button>
        <button class="button secondary" id="locale" type="button">繁中</button>
        <button class="icon-button" id="fullscreen" type="button" aria-label="Manage fullscreen">↗</button>
      </div>
    </header>
    <section class="stage" id="stage">
      <nav class="depth-dock" id="view-list" role="tablist" aria-orientation="vertical" aria-label="Governance depth views"></nav>
      <div class="depth-scene" id="depth-scene">
        <div class="transition-stack" id="transition-stack" aria-hidden="true"></div>
        <div class="preview-sheet two" aria-hidden="true"><span id="preview-two"></span></div>
        <div class="preview-sheet one" aria-hidden="true"><span id="preview-one"></span></div>
        <section class="active-sheet" id="active-sheet" data-loading="true">
          <section class="workspace" id="workspace" role="tabpanel" aria-labelledby="view-title" aria-busy="true">
            <div class="view-head"><h1 id="view-title" tabindex="-1">Service Status</h1><span class="state-pill" id="overall-state">Loading</span><span class="updated" id="updated"></span></div>
            <dl class="metrics" id="metrics"></dl>
            <div class="predictor" id="predictor"><input class="search" id="workspace-path" type="text" maxlength="240" placeholder="Q:\\Projects\\example-app" aria-label="Workspace path"><button class="button" id="predict" type="button">Predict</button><button class="button" id="clear-prediction" type="button">Clear</button><div class="prediction-result" id="prediction-result" role="status">Select a workspace path to evaluate governance readiness.</div></div>
            <div class="view-tools"><select class="view-select" id="view-select" aria-label="Governance view"></select><input class="search" id="filter" type="search" maxlength="80" placeholder="Filter governed records"><button class="button" id="apply-filter" type="button">Filter</button><button class="button" id="quick-test" type="button">Quick Test</button></div>
            <div class="table-wrap"><table class="data-table"><thead id="table-head"></thead><tbody id="table-body"><tr><td class="empty-cell">Loading governed records…</td></tr></tbody></table></div>
            <footer class="footer"><span class="operation" id="operation" role="status" aria-live="polite">Read-only governance workspace</span><span class="pager"><button class="button" id="previous" type="button">Previous</button><span id="page-label">1 / 1</span><button class="button" id="next" type="button">Next</button></span></footer>
          </section>
        </section>
      </div>
      <div class="dialog-backdrop" id="restart-dialog" hidden><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="restart-title" aria-describedby="restart-description"><h2 id="restart-title">Confirm governed restart</h2><p id="restart-description"></p><div class="row-actions"><button class="button" id="cancel-restart" type="button">Cancel</button><button class="button danger" id="confirm-restart" type="button">Restart</button></div></section></div>
    </section>
    <div class="host-note" id="host-note">15 governed views · depth controls switch live information planes</div>
  </div>
</main>
<script>
const $=id=>document.getElementById(id);
const NAV=[
  {id:"pulse",label:"Pulse",zh:"脈動",views:[["overview","Overview","總覽"],["service-status","Service Status","服務狀態"],["service-onboarding","Service Onboarding","服務導入"],["web-console-events","Web Console Events","主控台事件"]]},
  {id:"registry",label:"Registry",zh:"登錄",views:[["registered-projects","Registered Projects","已註冊專案"],["local-agents","Local Agents","本機 Agents"],["api-keys","API Keys","API 金鑰"],["storage-assets","Storage Assets","儲存資源"],["agent-instructions","Agent Instructions","Agent 指令"]]},
  {id:"operations",label:"Operations",zh:"維運",views:[["ports","Ports","連接埠"],["startup","Startup","啟動項目"],["public-routes","Public Routes","公開路由"],["terminal-profiles","Terminal Profiles","終端設定檔"],["web-entrypoints","Web Entrypoints","Web 入口"]]},
  {id:"workspace",label:"Workspace",zh:"工作區",views:[["workspace-predictor","Workspace Predictor","工作區預測器"]]}
];
const VIEW_STACK=NAV.flatMap(folder=>folder.views.map(view=>({folder,id:view[0],label:view[1],zh:view[2]})));
let currentView="service-status",currentFolder="pulse",currentPage=1,currentQuery="",workspaceData=null,pendingRestart=null,lastFocus=null,heightFrame=0,hostContext={},pendingDepthFrom=-1,depthTransition=null,viewRequestSequence=0,depthDockDrag=null,suppressDepthDockClickUntil=0,zh=/^zh/i.test(window.openai?.locale||navigator.language||"");
const DEPTH_MIN_HOLD_MS=520,DEPTH_DRAG_CLICK_GUARD_MS=140;
const copy={en:{filter:"Filter",quick:"Quick Test",previous:"Previous",next:"Next",predict:"Predict",clear:"Clear",loading:"Loading governed records…",empty:"No governed records.",doctor:"Doctor",restart:"Restart",cancel:"Cancel",confirm:"Confirm governed restart",readOnly:"Read-only governance workspace",expires:"Confirmation expires at",failed:"Operation failed",rows:"records",depthNote:"15 governed views · depth controls switch live information planes"},zh:{filter:"篩選",quick:"Quick Test",previous:"上一頁",next:"下一頁",predict:"預測",clear:"清除",loading:"正在讀取治理項目…",empty:"沒有治理項目。",doctor:"Doctor",restart:"Restart",cancel:"取消",confirm:"確認治理 Restart",readOnly:"唯讀治理工作區",expires:"確認有效至",failed:"操作失敗",rows:"項",depthNote:"15 個治理頁面 · 深度按鈕直接切換資訊平面"}};
const t=key=>(zh?copy.zh:copy.en)[key]||key;
const safe=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const folderById=id=>NAV.find(folder=>folder.id===id)||NAV[0];
const viewTuple=id=>VIEW_STACK.find(item=>item.id===id);
const depthIndex=id=>VIEW_STACK.findIndex(item=>item.id===id);
const output=result=>result?.structuredContent??result?.toolOutput??result;

function applyHostContext(next={}){
  hostContext={...hostContext,...next};
  const styles=hostContext.styles||window.openai?.styles;
  for(const [name,value] of Object.entries(styles?.variables||{})){if(name.startsWith("--")&&typeof value==="string")document.documentElement.style.setProperty(name,value)}
  const theme=hostContext.theme||window.openai?.theme||(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  const mode=hostContext.displayMode||window.openai?.displayMode||"inline";
  document.documentElement.dataset.displayMode=mode;
  const insets=hostContext.safeAreaInsets||window.openai?.safeAreaInsets;
  if(Number.isFinite(insets?.bottom))document.documentElement.style.setProperty("--host-safe-bottom",insets.bottom+"px");
}

function syncHeight(){
  cancelAnimationFrame(heightFrame);
  heightFrame=requestAnimationFrame(()=>window.openai?.notifyIntrinsicHeight?.());
}

function labelFor(item){return item?(zh?item.zh:item.label):""}
function prefersReducedMotion(){return matchMedia("(prefers-reduced-motion:reduce)").matches}
function animationFinished(animation){return animation?.finished?.catch(()=>undefined)||Promise.resolve()}
function delay(duration){return new Promise(resolveDelay=>setTimeout(resolveDelay,duration))}

function angledSceneTransform(direction,compact,travel=0){
  const x=(compact?10:12)+direction*travel;
  const y=compact?-2:-8;
  const z=compact?-12:-32;
  const rotationX=compact?1:1.8;
  const rotationY=compact?-5.5:-10.5;
  const rotationZ=direction>0?(compact?-.2:-.65):(compact?.2:.65);
  const scale=compact?.955:.91;
  return "translate3d("+x+"px,"+y+"px,"+z+"px) rotateX("+rotationX+"deg) rotateY("+rotationY+"deg) rotateZ("+rotationZ+"deg) scale("+scale+")";
}

function stackedPlaneTransform(depth,compact,travel=0){
  const x=-(compact?7+depth*8:20+depth*20)+travel;
  const y=-(compact?2+depth*2.6:4+depth*4.5);
  const z=-(compact?depth*8:depth*10);
  const scale=Math.max(compact?.94:.93,1-depth*(compact?.006:.004));
  return "translate3d("+x+"px,"+y+"px,"+z+"px) scale("+scale+")";
}

function renderTransitionStack(fromIndex,toIndex){
  const compact=matchMedia("(max-width:540px)").matches;
  const entries=VIEW_STACK
    .map((item,index)=>({item,index,distance:Math.abs(index-toIndex)}))
    .filter(entry=>entry.index!==fromIndex)
    .sort((left,right)=>(left.index===toIndex?-1:right.index===toIndex?1:left.distance-right.distance||left.index-right.index))
    .slice(0,compact?5:VIEW_STACK.length);
  $("transition-stack").innerHTML=entries.map((entry,order)=>{
    const depth=order+1;
    return '<div class="transition-sheet" data-view="'+entry.item.id+'" data-stack-depth="'+depth+'" data-target="'+(entry.index===toIndex)+'" style="z-index:'+(VIEW_STACK.length-depth)+'"><span class="transition-sheet-label">'+safe(labelFor(entry.item))+'</span><span class="transition-sheet-depth">z'+String(entry.index+1).padStart(2,"0")+'</span></div>';
  }).join("");
  return [...$("transition-stack").children];
}

function clearDepthTransition(transition=depthTransition){
  if(!transition)return;
  transition.cancelled=true;
  transition.waitAnimation?.cancel();
  for(const animation of transition.animations)animation.cancel();
  if(depthTransition!==transition)return;
  $("stage").removeAttribute("data-depth-phase");
  $("transition-stack").replaceChildren();
  depthTransition=null;
}

function beginDepthTransition(fromIndex,toIndex){
  clearDepthTransition();
  if(fromIndex<0||fromIndex===toIndex||prefersReducedMotion()||typeof $("depth-scene").animate!=="function")return null;
  const compact=matchMedia("(max-width:540px)").matches;
  const direction=toIndex>fromIndex?1:-1;
  const angle=angledSceneTransform(direction,compact);
  const transition={fromIndex,toIndex,direction,compact,angle,phase:"entering",cancelled:false,animations:[],waitAnimation:null,entered:null,enteredAt:0};
  depthTransition=transition;
  $("stage").dataset.depthPhase="entering";
  const planes=renderTransitionStack(fromIndex,toIndex);
  transition.planes=planes;
  const sceneAnimation=$("depth-scene").animate([
    {transform:"translate3d(0,0,0) rotateX(0) rotateY(0) rotateZ(0) scale(1)"},
    {transform:angle}
  ],{duration:260,easing:"cubic-bezier(.22,.72,.2,1)",fill:"both"});
  const activeAnimation=$("active-sheet").animate([
    {opacity:1},
    {opacity:.96}
  ],{duration:230,easing:"cubic-bezier(.22,.72,.2,1)",fill:"both"});
  const dockAnimation=$("view-list").animate([
    {transform:"translate3d(0,0,0) scale(1)"},
    {transform:"translate3d(-2px,0,-8px) scale(.98)"}
  ],{duration:260,easing:"cubic-bezier(.22,.72,.2,1)",fill:"both"});
  transition.animations.push(sceneAnimation,activeAnimation,dockAnimation);
  const enterAnimations=[sceneAnimation,activeAnimation,dockAnimation];
  planes.forEach((plane,index)=>{
    const depth=Number(plane.dataset.stackDepth);
    const opacity=Math.max(compact?.18:.28,.78-depth*(compact?.1:.032));
    plane.dataset.fanTransform=stackedPlaneTransform(depth,compact);
    plane.dataset.fanOpacity=String(opacity);
    const animation=plane.animate([
      {opacity:0,transform:"translate3d(0,0,-4px) scale(.998)"},
      {opacity,transform:plane.dataset.fanTransform}
    ],{duration:260,delay:Math.min(index*8,72),easing:"cubic-bezier(.22,.72,.2,1)",fill:"both"});
    transition.animations.push(animation);
    enterAnimations.push(animation);
  });
  transition.entered=Promise.all(enterAnimations.map(animationFinished)).then(()=>{
    if(depthTransition!==transition||transition.cancelled||transition.phase!=="entering")return;
    transition.enteredAt=performance.now();
    transition.phase="waiting";
    $("stage").dataset.depthPhase="waiting";
    transition.waitAnimation=$("depth-scene").animate([
      {transform:angle},
      {transform:angledSceneTransform(direction,compact,3)}
    ],{duration:900,easing:"ease-in-out",direction:"alternate",iterations:Infinity,fill:"both"});
  });
  return transition;
}

function renderNavigation(){
  const incoming=workspaceData?.navigation||[];
  const activeIndex=Math.max(0,depthIndex(currentView));
  const dock=$("view-list");
  const previousScrollTop=dock.scrollTop;
  dock.dataset.activeDepth=String(activeIndex);
  dock.innerHTML=VIEW_STACK.map((item,index)=>{
    const distance=Math.min(Math.abs(index-activeIndex),6);
    const shift=index>activeIndex?Math.min(distance*1.1,5):Math.min(distance*.45,2);
    const scale=Math.max(.88,1-distance*.018).toFixed(3);
    const opacity=Math.max(.48,1-distance*.075).toFixed(3);
    const meta=incoming.find(folder=>folder.id===item.folder.id)?.views?.find(view=>view.id===item.id);
    const label=labelFor(item);
    const count=meta?.count;
    const groupStart=index>0&&VIEW_STACK[index-1].folder.id!==item.folder.id;
    const title="z"+String(index+1).padStart(2,"0")+" · "+label+(count===undefined?"":" · "+count);
    return '<button class="view-button" type="button" role="tab" data-view="'+item.id+'" data-depth="'+index+'" data-depth-direction="'+(index<activeIndex?'shallower':index>activeIndex?'deeper':'current')+'" data-group-start="'+groupStart+'" aria-selected="'+(item.id===currentView)+'" aria-label="'+safe(title)+'" aria-posinset="'+(index+1)+'" aria-setsize="'+VIEW_STACK.length+'" title="'+safe(title)+'" tabindex="'+(item.id===currentView?0:-1)+'" style="--depth-shift:'+shift+'px;--depth-z:'+(-distance*8)+'px;--depth-scale:'+scale+';--depth-opacity:'+opacity+'"><span class="depth-index">'+String(index+1).padStart(2,"0")+'</span></button>';
  }).join("");
  dock.scrollTop=previousScrollTop;
  requestAnimationFrame(()=>alignActiveDepth(prefersReducedMotion()?"auto":"smooth"));
  $("view-select").innerHTML=VIEW_STACK.map(item=>'<option value="'+item.id+'" '+(item.id===currentView?'selected':'')+'>'+safe(labelFor(item))+'</option>').join("");
  const tuple=viewTuple(currentView)||VIEW_STACK[0];
  const displayedTuple=viewTuple(workspaceData?.view?.id)||tuple;
  const folder=folderById(tuple.folder.id);
  currentFolder=folder.id;
  const direction=activeIndex<VIEW_STACK.length-1?1:-1;
  const previewOneIndex=activeIndex+direction;
  const previewTwoIndex=activeIndex+direction*2;
  const previewOne=VIEW_STACK[previewOneIndex];
  const previewTwo=VIEW_STACK[previewTwoIndex];
  $("preview-one").textContent=previewOne?"z"+String(previewOneIndex+1).padStart(2,"0")+" · "+labelFor(previewOne):"";
  $("preview-two").textContent=previewTwo?"z"+String(previewTwoIndex+1).padStart(2,"0")+" · "+labelFor(previewTwo):"";
  $("folder-crumb").textContent=zh?folder.zh:folder.label;
  $("view-crumb").textContent=labelFor(tuple);
  $("view-title").textContent=labelFor(displayedTuple);
  $("depth-crumb").textContent="z"+String(activeIndex+1).padStart(2,"0");
  $("active-sheet").dataset.depth=String(activeIndex);
  $("locale").textContent=zh?"EN":"繁中";
  $("host-note").textContent=t("depthNote");
  $("filter").placeholder=zh?"篩選治理項目":"Filter governed records";
  $("apply-filter").textContent=t("filter");
  $("quick-test").textContent=t("quick");
  $("previous").textContent=t("previous");
  $("next").textContent=t("next");
  $("predict").textContent=t("predict");
  $("clear-prediction").textContent=t("clear");
  $("restart-title").textContent=t("confirm");
  $("cancel-restart").textContent=t("cancel");
  $("confirm-restart").textContent=t("restart");
  const predictorActive=displayedTuple.id==="workspace-predictor";
  $("workspace").dataset.predictor=String(predictorActive);
  $("predictor").dataset.active=String(predictorActive);
}

function alignActiveDepth(behavior="smooth"){
  const active=$("view-list").querySelector('[aria-selected="true"]');
  active?.scrollIntoView({block:"nearest",inline:"nearest",behavior});
}

async function animateDepthPlane(fromIndex,toIndex){
  const sheet=$("active-sheet");
  sheet.dataset.loading="false";
  $("workspace").setAttribute("aria-busy","false");
  const transition=depthTransition;
  if(!transition||transition.fromIndex!==fromIndex||transition.toIndex!==toIndex)return;
  await transition.entered;
  if(depthTransition!==transition||transition.cancelled)return;
  const holdRemaining=Math.max(0,DEPTH_MIN_HOLD_MS-(performance.now()-transition.enteredAt));
  if(holdRemaining>0)await delay(holdRemaining);
  if(depthTransition!==transition||transition.cancelled)return;
  transition.phase="settling";
  transition.waitAnimation?.cancel();
  $("stage").dataset.depthPhase="settling";
  const handoffTravel=transition.compact?8:22;
  const sceneAnimation=$("depth-scene").animate([
    {offset:0,transform:transition.angle},
    {offset:.34,transform:angledSceneTransform(transition.direction,transition.compact,-handoffTravel)},
    {offset:1,transform:"translate3d(0,0,0) rotateX(0) rotateY(0) rotateZ(0) scale(1)"}
  ],{duration:480,easing:"cubic-bezier(.2,.78,.22,1)",fill:"both"});
  const activeAnimation=sheet.animate([
    {offset:0,opacity:.96},
    {offset:.3,opacity:.84},
    {offset:1,opacity:1}
  ],{duration:480,easing:"cubic-bezier(.2,.78,.22,1)",fill:"both"});
  const dockAnimation=$("view-list").animate([
    {transform:"translate3d(-2px,0,-8px) scale(.98)"},
    {transform:"translate3d(0,0,0) scale(1)"}
  ],{duration:420,easing:"cubic-bezier(.2,.78,.22,1)",fill:"both"});
  const settleAnimations=[sceneAnimation,activeAnimation,dockAnimation];
  transition.animations.push(...settleAnimations);
  transition.planes.forEach(plane=>{
    const target=plane.dataset.target==="true";
    const depth=Number(plane.dataset.stackDepth);
    const animation=plane.animate([
      {offset:0,opacity:Number(plane.dataset.fanOpacity),transform:plane.dataset.fanTransform},
      {offset:.34,opacity:target ? .9 : Math.max(.06,Number(plane.dataset.fanOpacity)*.64),transform:stackedPlaneTransform(Math.max(1,depth-(target?1:0)),transition.compact,transition.direction*(target?12:-4))},
      {offset:1,opacity:0,transform:"translate3d(0,0,-3px) scale(.998)"}
    ],{duration:440,easing:"cubic-bezier(.2,.78,.22,1)",fill:"both"});
    transition.animations.push(animation);
    settleAnimations.push(animation);
  });
  await Promise.all(settleAnimations.map(animationFinished));
  if(depthTransition===transition&&!transition.cancelled)clearDepthTransition(transition);
}

function renderWorkspace(data,options={}){
  if(!data||data.schema!=="devgov.governance-workspace-view.v1")return;
  const preserveSelection=options.preserveSelection===true;
  const fromIndex=preserveSelection?-1:pendingDepthFrom;
  workspaceData=data;
  if(!preserveSelection){currentView=data.view.id;currentFolder=data.view.folderId}
  const metrics=data.view.metrics||[];
  $("metrics").innerHTML=metrics.map(item=>'<div class="metric" data-tone="'+safe(item.tone)+'"><dt>'+(zh?safe(item.labelZh):safe(item.label))+'</dt><dd>'+safe(item.value)+'</dd></div>').join("");
  const rows=data.view.rows||[],columns=data.view.columns||[];
  $("table-head").innerHTML='<tr>'+columns.map(label=>'<th scope="col">'+safe(label)+'</th>').join("")+(rows.some(row=>row.actions?.length)?'<th class="actions-cell" scope="col">Actions</th>':'')+'</tr>';
  const hasActions=rows.some(row=>row.actions?.length);
  $("table-body").innerHTML=rows.length?rows.map(row=>'<tr>'+row.cells.map((cell,index)=>'<td title="'+safe(cell)+'">'+(index===0?'<span class="row-state '+safe(String(row.state||"").toUpperCase())+'" aria-hidden="true"></span>':'')+safe(cell)+'</td>').join("")+(hasActions?'<td class="actions-cell"><div class="row-actions">'+operationButtons(row)+'</div></td>':'')+'</tr>').join(""):'<tr><td class="empty-cell" colspan="'+Math.max(1,columns.length)+'">'+safe(data.view.emptyMessage||t("empty"))+'</td></tr>';
  const page=data.view.page;
  currentPage=page.number;
  $("page-label").textContent=page.number+" / "+page.totalPages+" · "+page.totalRows+" "+t("rows");
  $("previous").disabled=!page.hasPrevious;
  $("next").disabled=!page.hasNext;
  $("updated").textContent=data.generatedAt?new Date(data.generatedAt).toLocaleTimeString():"";
  $("overall-state").textContent=data.view.id==="service-status"?(metrics.find(item=>item.tone==="bad"&&Number(item.value)>0)?"DEGRADED":"NOMINAL"):"GOVERNED";
  $("quick-test").hidden=data.view.id!=="service-status";
  renderNavigation();
  if(!preserveSelection){animateDepthPlane(fromIndex,depthIndex(currentView));pendingDepthFrom=-1}
  window.openai?.setWidgetState?.({activeFolder:currentFolder,activeView:currentView,page:currentPage,query:currentQuery,lastRefresh:data.generatedAt});
  syncHeight();
}

function operationButtons(row){
  const actions=row.actions||[];
  let html="";
  if(actions.includes("doctor"))html+='<button class="button" type="button" data-action="doctor" data-target="'+safe(row.controlTargetId)+'">'+t("doctor")+'</button>';
  if(actions.includes("restart"))html+='<button class="button danger" type="button" data-action="restart" data-target="'+safe(row.controlTargetId)+'">'+t("restart")+'</button>';
  return html;
}

async function loadView(options={}){
  const requestedView=options.viewId??currentView;
  const requestedPage=options.page??currentPage;
  const requestId=++viewRequestSequence;
  setOperation(t("loading"),"pending");
  $("active-sheet").dataset.loading="true";
  $("workspace").setAttribute("aria-busy","true");
  try{
    const result=await window.openai?.callTool?.("query_governance_workspace",{viewId:requestedView,page:requestedPage,pageSize:6,query:currentQuery});
    if(requestId!==viewRequestSequence)return;
    const next=output(result);
    if(!next)throw new Error(t("failed"));
    renderWorkspace(next);
    setOperation(t("readOnly"),"completed");
  }catch(error){
    if(requestId!==viewRequestSequence)return;
    $("active-sheet").dataset.loading="false";
    $("workspace").setAttribute("aria-busy","false");
    clearDepthTransition();
    const displayedView=workspaceData?.view?.id;
    if(displayedView){currentView=displayedView;currentFolder=viewTuple(displayedView)?.folder.id||currentFolder;renderNavigation()}
    pendingDepthFrom=-1;
    setOperation(error?.message||t("failed"),"failed");
  }
}

function setOperation(message,state){$("operation").textContent=message;$("operation").dataset.state=state||"pending"}

async function runDoctor(target){
  setOperation(t("doctor")+" · "+target,"pending");
  try{
    const operation=output(await window.openai?.callTool?.("run_governance_doctor",{controlTargetId:target}))?.operation;
    if(!operation||operation.status==="failed")throw new Error(operation?.summary||t("failed"));
    setOperation(operation.summary,"completed");
    await loadView({page:currentPage});
  }catch(error){setOperation(error?.message||t("failed"),"failed")}
}

async function prepareRestart(target,button){
  lastFocus=button;
  setOperation(t("restart")+" · "+target,"pending");
  try{
    const operation=output(await window.openai?.callTool?.("prepare_governance_restart",{controlTargetId:target}))?.operation;
    if(!operation||operation.status==="failed")throw new Error(operation?.summary||t("failed"));
    pendingRestart=operation;
    $("restart-description").textContent=target+" · "+t("expires")+" "+new Date(operation.expiresAt).toLocaleTimeString()+". This confirmation is target-bound and single-use.";
    $("restart-dialog").hidden=false;
    $("confirm-restart").focus();
  }catch(error){setOperation(error?.message||t("failed"),"failed")}
}

async function confirmRestart(){
  if(!pendingRestart)return;
  const current=pendingRestart;
  $("confirm-restart").disabled=true;
  try{
    const operation=output(await window.openai?.callTool?.("restart_governed_service",{controlTargetId:current.controlTargetId,confirmationToken:current.confirmationToken}))?.operation;
    if(!operation||operation.status==="failed")throw new Error(operation?.summary||t("failed"));
    setOperation(operation.summary,"completed");
    closeDialog();
    await loadView({page:currentPage});
  }catch(error){setOperation(error?.message||t("failed"),"failed");closeDialog()}
  finally{$("confirm-restart").disabled=false}
}

function closeDialog(){pendingRestart=null;$("restart-dialog").hidden=true;lastFocus?.focus();lastFocus=null}

function selectView(viewId,focusHeading=true){
  const tuple=viewTuple(viewId);
  if(!tuple||viewId===currentView)return;
  const displayedView=workspaceData?.view?.id||currentView;
  pendingDepthFrom=depthIndex(displayedView);
  currentView=viewId;
  currentFolder=tuple.folder.id;
  currentPage=1;
  currentQuery="";
  $("filter").value="";
  $("active-sheet").dataset.depthDirection=depthIndex(viewId)>pendingDepthFrom?"deeper":"shallower";
  beginDepthTransition(pendingDepthFrom,depthIndex(viewId));
  renderNavigation();
  loadView({page:1,viewId});
  if(focusHeading)$("view-title").focus();
}

async function predictWorkspace(){
  const path=$("workspace-path").value;
  setOperation(t("predict"),"pending");
  try{
    const prediction=output(await window.openai?.callTool?.("predict_governance_workspace_path",{workspacePath:path}))?.prediction;
    if(!prediction)throw new Error(t("failed"));
    $("prediction-result").dataset.state=prediction.state;
    $("prediction-result").textContent=prediction.state+" · "+prediction.summary+" · "+(prediction.projectName||prediction.pathClass)+" · "+prediction.ruleCount+" rules";
    setOperation(t("readOnly"),"completed");
  }catch(error){setOperation(error?.message||t("failed"),"failed")}
}

$("view-list").addEventListener("click",event=>{if(performance.now()<suppressDepthDockClickUntil){event.preventDefault();return}const button=event.target.closest("[data-view]");if(button)selectView(button.dataset.view)});
$("view-list").addEventListener("dragstart",event=>event.preventDefault());
$("view-list").addEventListener("pointerdown",event=>{
  if(event.pointerType==="touch"||event.button!==0)return;
  depthDockDrag={pointerId:event.pointerId,startY:event.clientY,startScrollTop:event.currentTarget.scrollTop,moved:false};
});
window.addEventListener("pointermove",event=>{
  if(!depthDockDrag||depthDockDrag.pointerId!==event.pointerId)return;
  const delta=event.clientY-depthDockDrag.startY;
  const dock=$("view-list");
  if(Math.abs(delta)>3){depthDockDrag.moved=true;dock.dataset.dragging="true"}
  if(depthDockDrag.moved){dock.scrollTop=depthDockDrag.startScrollTop-delta;event.preventDefault()}
});
function endDepthDockDrag(event){
  if(!depthDockDrag||(event?.pointerId!==undefined&&depthDockDrag.pointerId!==event.pointerId))return;
  const dock=$("view-list");
  const moved=depthDockDrag.moved;
  depthDockDrag=null;
  delete dock.dataset.dragging;
  if(moved)suppressDepthDockClickUntil=performance.now()+DEPTH_DRAG_CLICK_GUARD_MS;
}
window.addEventListener("pointerup",endDepthDockDrag);
window.addEventListener("pointercancel",endDepthDockDrag);
window.addEventListener("blur",()=>endDepthDockDrag());
$("view-list").addEventListener("keydown",event=>{
  const buttons=[...$("view-list").querySelectorAll("[role=tab]")];
  const index=buttons.indexOf(event.target);
  if(index<0)return;
  let next=index;
  if(event.key==="ArrowDown"||event.key==="ArrowRight")next=(index+1)%buttons.length;
  else if(event.key==="ArrowUp"||event.key==="ArrowLeft")next=(index-1+buttons.length)%buttons.length;
  else if(event.key==="Home")next=0;
  else if(event.key==="End")next=buttons.length-1;
  else if(event.key==="Enter"||event.key===" "){event.preventDefault();event.target.click();return}
  else return;
  event.preventDefault();
  buttons[next].focus();
  buttons[next].scrollIntoView({block:"nearest",behavior:prefersReducedMotion()?"auto":"smooth"});
});
$("view-select").onchange=event=>selectView(event.target.value);
$("apply-filter").onclick=()=>{currentQuery=$("filter").value.trim();currentPage=1;loadView({page:1})};
$("filter").addEventListener("keydown",event=>{if(event.key==="Enter")$("apply-filter").click()});
$("previous").onclick=()=>loadView({page:currentPage-1});
$("next").onclick=()=>loadView({page:currentPage+1});
$("refresh").onclick=()=>loadView({page:currentPage});
$("quick-test").onclick=()=>loadView({page:currentPage});
$("locale").onclick=()=>{zh=!zh;renderNavigation();if(workspaceData)renderWorkspace(workspaceData,{preserveSelection:true})};
$("light").onclick=()=>applyHostContext({theme:"light"});
$("dark").onclick=()=>applyHostContext({theme:"dark"});
$("fullscreen").onclick=async()=>{const result=await window.openai?.requestDisplayMode?.({mode:"fullscreen"});applyHostContext({displayMode:result?.mode||"fullscreen"});syncHeight()};
$("back").onclick=()=>selectView("service-status");
$("table-body").addEventListener("click",event=>{const button=event.target.closest("[data-action]");if(!button)return;if(button.dataset.action==="doctor")runDoctor(button.dataset.target);if(button.dataset.action==="restart")prepareRestart(button.dataset.target,button)});
$("predict").onclick=predictWorkspace;
$("clear-prediction").onclick=()=>{$("workspace-path").value="";$("prediction-result").removeAttribute("data-state");$("prediction-result").textContent="Select a workspace path to evaluate governance readiness."};
$("confirm-restart").onclick=confirmRestart;
$("cancel-restart").onclick=closeDialog;
$("restart-dialog").addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();closeDialog()}if(event.key==="Tab"){const nodes=[$("cancel-restart"),$("confirm-restart")];const index=nodes.indexOf(document.activeElement);event.preventDefault();nodes[(index+(event.shiftKey?-1:1)+nodes.length)%nodes.length].focus()}});
window.addEventListener("openai:set_globals",event=>{const globals=event.detail?.globals||{};applyHostContext(globals)});
applyHostContext({theme:window.openai?.theme,styles:window.openai?.styles,displayMode:window.openai?.displayMode,safeAreaInsets:window.openai?.safeAreaInsets});
renderNavigation();
new ResizeObserver(syncHeight).observe(document.querySelector(".shell"));
loadView({page:1});
syncHeight();
</script>
</body>
</html>`;
}
