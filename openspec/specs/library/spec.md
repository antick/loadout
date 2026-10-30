# library

## Purpose

The skill library under the user's Loadout home: SQLite metadata, on-disk folders, portable metadata files, tags, favourites, validation against the Agent Skills format, and supporting services for duplicates, usage, listing cost, and publishing.

## Requirements

### Requirement: Library storage layout

The core library service SHALL store each skill in its own folder under the library `skills/` directory, maintain `loadout.db` for metadata, and rewrite portable metadata under `skills/.loadout/` when skills, tags, or presets change via `ctx.touched`.

#### Scenario: Tag change on a skill

- **WHEN** the user sets tags on a skill
- **THEN** the database and portable metadata files update and dependents receive a `data:changed` scope for skills

### Requirement: Skill listing and filters

The `SkillsApi` SHALL list skills with document text, deployment state, source metadata, tags, favourites, and update availability, and SHALL support rename, export archive, authored marking, notes, and removal into Recently removed with optional dry run.

#### Scenario: Remove with dry run

- **WHEN** `removeMany` is called with `dryRun: true`
- **THEN** the API reports what would be removed without deleting folders or undeploying

### Requirement: Agent Skills format checks

The library SHALL run cached Agent Skills format checks per skill using rules from `packages/shared` and store results keyed by content hash in `packages/core/src/skills/checks.ts`.

#### Scenario: Skill content unchanged

- **WHEN** a skill file hash matches the cached check entry
- **THEN** the service reuses the prior check outcome without re-reading all files

### Requirement: Duplicate detection

The duplicates service SHALL detect likely duplicate skills by file sameness, similar text, or similar names and SHALL support merging one skill into another or dismissing a pair.

#### Scenario: User merges duplicates

- **WHEN** merge completes successfully
- **THEN** one library skill remains and the other is removed according to the merge plan

### Requirement: Usage tracking

The usage service SHALL read agent session logs incrementally and record skill usage events in `usage_events` for display in the app.

#### Scenario: New session log lines appear

- **WHEN** usage sync runs against updated logs
- **THEN** new usage events are appended without duplicating prior events
