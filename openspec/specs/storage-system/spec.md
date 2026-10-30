# storage-system

## Purpose

Loadout home and library paths, storage sizing and cleanup, Recently removed restoration, settings persistence, system diagnostics, deployment repair, CLI publishing, and agent-control setup.

## Requirements

### Requirement: Library location

`SystemApi.libraryLocation` SHALL report the active library path, including moves configured in settings, and `setLibraryPath` SHALL move the library only into an empty destination according to `packages/core/src/paths.ts` rules.

#### Scenario: Move library in settings

- **WHEN** the user selects a new empty folder
- **THEN** skills, database, history, cache, logs, and related directories move together or the operation rolls back

### Requirement: Storage report and cleanup

`StorageApi.report` SHALL size each on-disk area, and `clear` SHALL empty rebuildable areas such as caches without deleting in-use Git clones.

#### Scenario: Clear clone cache

- **WHEN** `clear` targets the clone cache area
- **THEN** unused cached repositories are removed and the API returns bytes freed

### Requirement: Recently removed

The storage service SHALL list skill folders removed from agent or project paths, restore them to their prior location, or delete them permanently.

#### Scenario: Restore removed folder

- **WHEN** `restoreRemoved` succeeds
- **THEN** the skill folder returns to its origin path and any occupant is moved aside first

### Requirement: Settings store

`SettingsApi` SHALL read and write typed settings keys defined in `packages/shared/src/settings.ts`, including internal JSON blobs referenced by `INTERNAL_KEYS`.

#### Scenario: Change theme palette setting

- **WHEN** `set` updates a theme-related setting key
- **THEN** subsequent `all` returns the new value for the renderer to apply

### Requirement: Deployment repair and diagnostics

On startup or request, the system service SHALL repair missing deployments, expose repair reports, export diagnostic bundles, and surface last crash markers for the UI banner flow.

#### Scenario: Repair after broken symlink

- **WHEN** `repairDeployments` runs and finds a broken deployment link
- **THEN** the report lists repaired paths and the UI can dismiss the notice after success
