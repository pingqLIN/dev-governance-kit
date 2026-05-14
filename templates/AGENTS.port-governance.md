# Port Governance

Before starting any dev server:

1. Read `PORTS.md`.
2. Use only declared ports.
3. Do not choose random ports.
4. Do not accept auto-incremented fallback ports.
5. Default host must be `127.0.0.1`.
6. Do not bind to `0.0.0.0` unless the task explicitly requires LAN or mobile testing.
7. If a port is occupied, stop and report the requested port, occupied process if detectable, and proposed fix.
8. Any new service must update `PORTS.md`, `.env.example`, startup scripts, and the global port registry.
9. Treat generated scan reports as evidence, not policy.
10. Do not run an automatic patch/apply flow unless the project explicitly provides a reviewed command for it.
11. The reusable `check-ports.mjs` template checks TCP availability only; verify UDP allocations with a protocol-specific command.

Docker services:

- Use `expose` for internal-only services.
- Use `ports` only when host access is required.
