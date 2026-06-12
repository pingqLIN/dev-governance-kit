import path from "node:path";

export const SERVICE_CONTROL_HOST = "127.0.0.1";
export const SERVICE_CONTROL_PORT = 3201;
export const SERVICE_CONTROL_URL = `http://${SERVICE_CONTROL_HOST}:${SERVICE_CONTROL_PORT}`;
export const SERVICE_CONTROL_ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000"
]);

export function resolveControlTarget(root, controlEntry) {
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

  return null;
}

export function isAllowedControlOrigin(origin) {
  return SERVICE_CONTROL_ALLOWED_ORIGINS.has(origin);
}
