# Baseline source inventory

Inventory at `b2da07713b873b199ed214837fca088a0353f054`. Links are discovery
aids, not claims of complete spec coverage or successful test execution.
Read [baseline.md](baseline.md) for gaps. Runtime contracts also live in
`packages/shared/src/` and behaviour in `packages/core/src/`.

Maintain this index when adding or moving relevant sources. Keep historical
plans distinguishable from implementation evidence.

## Product and agent guidance

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [docs/FEATURES.md](../docs/FEATURES.md)
- [docs/TODO.md](../docs/TODO.md)
- [docs/INSTALL.md](../docs/INSTALL.md)
- [docs/RELEASING.md](../docs/RELEASING.md)

## Shared contract

- [Loadout API surface](../packages/shared/src/api.ts)
- [Install and updates API](../packages/shared/src/api-install.ts)
- [Backup API](../packages/shared/src/api-backup.ts)
- [Settings keys](../packages/shared/src/settings.ts)
- [Error codes](../packages/shared/src/errors.ts)
- [Skill format checks](../packages/shared/src/skill-checks.ts)

## Core services

- [Core factory](../packages/core/src/core.ts)
- [Skills store and service](../packages/core/src/skills/)
- [Deploy engine](../packages/core/src/deploy/)
- [Install and market](../packages/core/src/install/), [market](../packages/core/src/market/)
- [Editor](../packages/core/src/editor/)
- [Agents registry](../packages/core/src/agents/)
- [Workspace](../packages/core/src/workspace/)
- [Instructions](../packages/core/src/instructions/)
- [Presets](../packages/core/src/presets/)
- [Projects](../packages/core/src/projects/)
- [Skills file](../packages/core/src/skills-file/)
- [Backup](../packages/core/src/backup/)
- [Updates](../packages/core/src/updates/)
- [Sources](../packages/core/src/sources/)
- [Origin](../packages/core/src/origin/)
- [Safety](../packages/core/src/safety/)
- [Storage](../packages/core/src/storage/)
- [System](../packages/core/src/system/)
- [Health and doctor](../packages/core/src/health/)
- [Duplicates](../packages/core/src/duplicates/)
- [Usage](../packages/core/src/usage/)
- [Publish](../packages/core/src/publish/)
- [Listing](../packages/core/src/listing/)
- [Scan](../packages/core/src/scan/)
- [Paths and library layout](../packages/core/src/paths.ts)

## Desktop application

- [Main process and IPC](../apps/desktop/src/main/)
- [Preload bridge](../apps/desktop/src/preload/)
- [Renderer routes](../apps/desktop/src/renderer/src/routes/)
- [Renderer API proxy](../apps/desktop/src/renderer/src/lib/api.ts)
- [Query invalidation](../apps/desktop/src/renderer/src/lib/events.ts)
- [Browser preview dev server](../apps/desktop/dev-server/)

## CLI

- [Command groups](../packages/cli/src/commands/index.ts)
- [Skills commands](../packages/cli/src/commands/skills.ts)
- [CLI tests](../packages/cli/test/)

## Tests (behaviour evidence)

- [Core package tests](../packages/core/test/)
- [Shared package tests](../packages/shared/test/)
- [Playwright UI tests](../e2e/)

## Capability to spec mapping

| Spec folder      | Primary inventory sections above                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| desktop-shell    | Desktop application, Shared contract (`AppApi`, IPC)                                                         |
| library          | Core services (skills, duplicates, usage, publish, listing)                                                  |
| deploy           | Core services (deploy), Shared contract (`DeployApi`)                                                        |
| install          | Core services (install, market, scan), Shared contract (`InstallApi`, `MarketApi`)                           |
| editor           | Core services (editor), Shared contract (`EditorApi`)                                                        |
| agents-workspace | Core services (agents, workspace), Shared contract (`AgentsApi`, `WorkspaceApi`)                             |
| instructions     | Core services (instructions), Shared contract (`InstructionsApi`)                                            |
| presets          | Core services (presets), Shared contract (`PresetsApi`)                                                      |
| projects         | Core services (projects, skills-file), Shared contract (`ProjectsApi`, `SkillsFileApi`)                      |
| backup-sync      | Core services (backup), Shared contract (`BackupApi`), CLI git commands                                      |
| updates-sources  | Core services (updates, sources, origin), Shared contract (`UpdatesApi`)                                     |
| safety           | Core services (safety), Shared contract (`SafetyApi`)                                                        |
| cli              | CLI, Core health                                                                                             |
| storage-system   | Core services (storage, system, settings, paths), Shared contract (`StorageApi`, `SystemApi`, `SettingsApi`) |
