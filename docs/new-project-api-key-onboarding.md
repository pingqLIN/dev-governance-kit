# New Project API Key Onboarding

Use this flow when a new project needs development API keys.

## Standard Flow

1. Generate a DevGov onboarding plan before adding project-local credential files:

```powershell
npm run plan:new-project-api-keys -- --project-name <project> --service "OpenAI Platform" --out reports\<project>-api-keys.md --json-out reports\<project>-api-keys.json
```

2. Check the report for registered variable names and live persistent scopes. Missing scopes are setup evidence only; they are not permission to reveal or create credentials.
3. In the new project, commit a blank `.env.example` based on `templates/new-project.env.example`.
4. Keep real values in OS User/Machine environment variables or untracked `.env.local`.
5. Load dotenv with `override:false` so already-set environment variables win.
6. Use `templates/api-key-env-resolver.mjs` or an equivalent helper that reads `process.env`, reports only names and presence, and never logs values.

## Runtime Precedence

Use this order:

1. Existing process environment inherited from OS User/Machine variables.
2. Untracked project-local `.env.local` loaded without overriding existing values.
3. Blank committed `.env.example` as documentation only.

DevGov may inspect persistent environment variable names and registry metadata, but project runtime should not scan credential stores or print secret values.

## Registry Boundary

`registry/api-keys.registry.json` stores stable credential-location metadata only:

- service,
- variable name,
- storage location type,
- access method,
- usage rules,
- provider settings URL,
- review status.

It must not store credential values, credential file contents, local secret paths, shell history, or full command lines.
