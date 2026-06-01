# Project Port Map

Source: `registry/ports.registry.json`

This file is the target-project read model for approved registry entries. Do not use it as a scratchpad for temporary process state.

| Service | Port | Host | Visibility | Protocol | Notes |
|---|---:|---|---|---|---|
| `<service>` | `<port>` | `127.0.0.1` | `local` | `tcp` | `<why this service owns this port>` |

## Rules

- Do not auto-increment ports silently.
- Do not bind development services to `0.0.0.0` unless LAN/mobile testing is explicitly required.
- Public or LAN exposure must be documented in this file and the global registry.
- Docker internal services should use `expose`; use `ports` only when host access is required.
- If a port is occupied, stop and report the requested port, owning process if detectable, and proposed fix.
- Generated scan reports are evidence only; promote intentional changes into this file and the registry after review.
- Startup commands should call `require-governed-port.mjs` before the raw server command so the registry entry is checked before binding.
