## Shared Resource Coordination

This project follows DevGov shared-resource coordination.

Before diagnosing lag, timeout, slow browser automation, sluggish UI feedback, or delayed tool responses as a project failure, check current DevGov resource-coordination status and classify the observation as `target-unhealthy`, `environment-contention`, or `unknown-degraded`.

Before using exclusive or capacity-limited resources such as browser profiles, DevTools sessions, GPU-heavy rendering, 3D/WebGL/WebGPU, foreground screen control, keyboard, pointer, simulator, or display control, register a sanitized time-bound claim through the DevGov resource-coordination surface.

Stale resource snapshots or claims are historical evidence only. Refresh them before using them for current diagnosis, ownership, or scheduling decisions.

### Project Exclusive Resources

Declare only resources this project can realistically occupy. Use `None known` when the project does not use that resource class.

- Browser automation: `<describe browser profile, extension state, DevTools, or None known>`
- GPU/rendering/model inference: `<describe WebGL/WebGPU/video/local model work, or None known>`
- Foreground control: `<describe screen, pointer, keyboard, simulator, display use, or None known>`

Generated resource-coordination reports are evidence, not policy. Apply this overlay through a reviewed AGENTS diff; do not bulk-apply it to projects automatically.
