# Conditional UFFS Search Routing Overlay (PROPOSED, not active)

For authorized **Windows NTFS filename, path, extension and metadata discovery**, prefer the DevGov-governed UFFS search adapter where available. Scope the query to the narrowest approved root and verify results with an authorized file tool before content access. UFFS results grant no file permissions. For file contents, Git semantics, semantic search, cloud connectors, network shares, WSL/Linux or non-NTFS storage, use the appropriate native search tool. If UFFS is absent, warming, denied, stale, or incomplete, use a governed fallback and report uncertainty; never equate unavailability with not found. Never auto-elevate, add a broker, start an unapproved service/port, or expose raw UFFS MCP to remote agents.

Source of detail: docs/uffs-agent-search-governance.md
Activation: Only after reviewed registry promotion, secure adapter acceptance and client-by-client configuration. This file alone has no runtime authority.
