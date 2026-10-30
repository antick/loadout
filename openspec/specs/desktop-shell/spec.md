# desktop-shell

## Purpose

The Electron desktop application shell: file-based TanStack Router pages, IPC to core services, and the renderer data layer that refetches when the library changes.

## Requirements

### Requirement: Primary navigation routes

The desktop renderer SHALL expose file routes for the dashboard, library, install flow, agents, presets, projects, backup, sources, settings, and skill or instruction editors as defined under `apps/desktop/src/renderer/src/routes/`.

#### Scenario: User opens the library

- **WHEN** the user navigates to `/library`
- **THEN** the library page loads and reads skills through the typed `window.loadout` API proxy

### Requirement: IPC namespace dispatch

The desktop main process SHALL forward renderer calls on channel names of the form `<namespace>.<method>` for every namespace listed in `API_NAMESPACES` in `packages/shared/src/api.ts`, except `app`, which the main process implements locally.

#### Scenario: Renderer invokes a core method

- **WHEN** the renderer calls `api.skills.list()`
- **THEN** the main process dispatches to the core `SkillsApi.list` implementation and returns JSON-serializable results

### Requirement: Data change invalidation

The renderer SHALL subscribe to main-process `data:changed` events and invalidate TanStack Query caches for the affected scope so lists and detail views refetch after mutations.

#### Scenario: Skill mutation completes

- **WHEN** a mutation changes skills metadata
- **THEN** the UI refetches skill queries without requiring a full page reload
