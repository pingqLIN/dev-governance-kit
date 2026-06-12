import path from "node:path";

export const SERVICE_CONTROL_HOST = "127.0.0.1";
export const SERVICE_CONTROL_PORT = 3201;
export const SERVICE_CONTROL_URL = `http://${SERVICE_CONTROL_HOST}:${SERVICE_CONTROL_PORT}`;
export const SERVICE_CONTROL_ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000"
]);

export function resolveControlTarget(root, controlEntry) {
  if (controlEntry.controlTargetId === "devgov-dashboard" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-devgov-dashboard.ps1"),
      runtimeKind: "local-devgov-dashboard",
      summary: "Bounded local dashboard doctor control path."
    };
  }
  if (controlEntry.controlTargetId === "devgov-dashboard" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-devgov-dashboard.ps1"),
      runtimeKind: "local-devgov-dashboard",
      summary: "Bounded local dashboard ensure-running control path."
    };
  }
  if (controlEntry.controlTargetId === "tunnel-client-local-filesystem-mcp" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-tunnel-client-local-filesystem-mcp.ps1"),
      runtimeKind: "openai-mcp-tunnel-local-filesystem-mcp",
      summary: "Run the reviewed tunnel-client doctor wrapper through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "tunnel-client-local-filesystem-mcp" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-tunnel-client-local-filesystem-mcp.ps1"),
      runtimeKind: "openai-mcp-tunnel-local-filesystem-mcp",
      summary: "Run the reviewed tunnel-client ensure-running repair wrapper through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "local-archive-maintainer" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-local-archive-maintainer.ps1"),
      runtimeKind: "local-archive-maintainer-windows-service",
      summary: "Run the reviewed Local Archive Maintainer Windows service doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "local-archive-maintainer" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-local-archive-maintainer.ps1"),
      runtimeKind: "local-archive-maintainer-windows-service",
      summary: "Run the reviewed Local Archive Maintainer Windows service restart through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "ps3eye-windows-virtual-camera" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-ps3eye-windows-virtual-camera.ps1"),
      runtimeKind: "ps3eye-windows-virtual-camera",
      summary: "Run the reviewed PS3 Eye virtual camera doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "ps3eye-windows-virtual-camera" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-ps3eye-windows-virtual-camera.ps1"),
      runtimeKind: "ps3eye-windows-virtual-camera",
      summary: "Run the reviewed PS3 Eye virtual camera repair/start path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "taste" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-taste.ps1"),
      runtimeKind: "taste-next-runtime",
      summary: "Run the reviewed Taste runtime check through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "taste" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-taste.ps1"),
      runtimeKind: "taste-next-runtime",
      summary: "Run the reviewed Taste ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "codex-calendar-todo-staging" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-codex-calendar-todo-staging.ps1"),
      runtimeKind: "codex-calendar-todo-runtime",
      summary: "Run the reviewed Codex Calendar Todo staging doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "codex-calendar-todo-staging" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-codex-calendar-todo-staging.ps1"),
      runtimeKind: "codex-calendar-todo-runtime",
      summary: "Run the reviewed Codex Calendar Todo staging ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "sbs" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-sbs.ps1"),
      runtimeKind: "sbs-local-proxy",
      summary: "Run the reviewed SBS local proxy doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "sbs" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-sbs.ps1"),
      runtimeKind: "sbs-local-proxy",
      summary: "Run the reviewed SBS local proxy ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "color-management-shader" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-color-management-shader.ps1"),
      runtimeKind: "color-management-shader-display-shader-control-lab",
      summary: "Run the reviewed Display Shader Control Lab doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "color-management-shader" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-color-management-shader.ps1"),
      runtimeKind: "color-management-shader-display-shader-control-lab",
      summary: "Run the reviewed Display Shader Control Lab ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "url-hero" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-url-hero.ps1"),
      runtimeKind: "url-hero-vite-dev",
      summary: "Run the reviewed URL Hero doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "url-hero" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-url-hero.ps1"),
      runtimeKind: "url-hero-vite-dev",
      summary: "Run the reviewed URL Hero ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "codex-remote" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-codex-remote.ps1"),
      runtimeKind: "codex-remote-app-server",
      summary: "Run the reviewed codex-remote doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "codex-remote" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-codex-remote.ps1"),
      runtimeKind: "codex-remote-app-server",
      summary: "Run the reviewed codex-remote ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "lm-studio" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-lm-studio.ps1"),
      runtimeKind: "lm-studio-local-api",
      summary: "Run the reviewed LM Studio local API doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "lm-studio" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-lm-studio.ps1"),
      runtimeKind: "lm-studio-local-api",
      summary: "Run the reviewed LM Studio local API ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "tb2" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-tb2.ps1"),
      runtimeKind: "tb2-local-mcp",
      summary: "Run the reviewed TB2 local MCP doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "tb2" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-tb2.ps1"),
      runtimeKind: "tb2-local-mcp",
      summary: "Run the reviewed TB2 local MCP ensure-running path through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "comfyui-local" && controlEntry.action === "doctor") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "doctor-comfyui-local.ps1"),
      runtimeKind: "comfyui-local-http",
      summary: "Run the reviewed ComfyUI localhost-only doctor through DevGov local control."
    };
  }
  if (controlEntry.controlTargetId === "comfyui-local" && controlEntry.action === "restart") {
    return {
      controlTargetId: controlEntry.controlTargetId,
      action: controlEntry.action,
      wrapperPath: path.join(root, "scripts", "service-control", "restart-comfyui-local.ps1"),
      runtimeKind: "comfyui-local-http",
      summary: "Run the reviewed ComfyUI localhost-only ensure-running path through DevGov local control."
    };
  }

  return null;
}

export function isAllowedControlOrigin(origin) {
  return SERVICE_CONTROL_ALLOWED_ORIGINS.has(origin);
}
