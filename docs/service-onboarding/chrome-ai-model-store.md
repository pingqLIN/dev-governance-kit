# Chrome AI Model Store Governance

This record governs the local filesystem procedure for sharing Chrome built-in AI model bytes across installed Chrome channels.

## Policy

- Stable Chrome owns the primary `OptGuideOnDeviceModel` store.
- Installed secondary channels, such as Beta, Dev, and Canary, should use a filesystem link to the Stable primary store.
- Non-installed channels are skipped. The reset path does not create a new browser profile root unless an operator runs the lower-level script with an explicit include flag.
- Chrome should be closed before any link repair. The reset wrapper refuses to modify channel model paths when Chrome is running and a repair is required.
- Replaced real directories or wrong links are moved into a channel-local `.del` folder with a timestamped name before a new link is created.

## Commands

Run Doctor:

```powershell
npm run chrome-ai:doctor
```

Run Reset:

```powershell
npm run chrome-ai:reset
```

The direct implementation is `scripts/service-control/Manage-ChromeAiModelStore.ps1`. The DevGov dashboard uses the reviewed service-control wrappers instead of calling the lower-level script directly.

## What Doctor Checks

- Stable primary model directory exists as a real directory.
- Stable primary model directory contains a version folder and `weights.bin`.
- Installed secondary channel roots have `OptGuideOnDeviceModel` as a `SymbolicLink` or `Junction`.
- Secondary channel links point back to the Stable primary store.

## What Reset Repairs

Reset only repairs installed secondary channels. It leaves the Stable primary store untouched unless Stable is missing or unhealthy, in which case it fails and reports the blocker.

For each installed secondary channel with drift, Reset:

1. Refuses to continue if Chrome is currently running.
2. Moves the existing `OptGuideOnDeviceModel` entry to `.del\OptGuideOnDeviceModel-<timestamp>`.
3. Creates a `SymbolicLink` to the Stable primary store, falling back to a `Junction` when symbolic links are unavailable.
4. Runs Doctor again and reports the final state.

## Rollback

Close Chrome, then restore the timestamped `.del` backup for the affected channel back to `OptGuideOnDeviceModel`. If the Stable primary store is healthy, running Reset again will recreate the shared-link layout.
