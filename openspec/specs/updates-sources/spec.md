# updates-sources

## Purpose

Checking skill sources for updates, applying updates with diffs, tracking newly discovered source repositories, and linking skills without recorded origins.

## Requirements

### Requirement: Source update checks

The updates service SHALL check configured sources on schedules or on demand, expose available updates per skill, and apply single or batch updates with optional refresh of source metadata.

#### Scenario: Update one skill from source

- **WHEN** an update apply succeeds for a skill with a changed upstream
- **THEN** the library folder content matches the fetched source and deployment copies refresh as defined in core

### Requirement: Source diff preview

`UpdatesApi` SHALL provide source diffs showing what would change before the user confirms an update, honouring options documented in `SourceDiffOptions`.

#### Scenario: Preview update diff

- **WHEN** the UI requests a diff for a skill with an available update
- **THEN** the API returns file-level changes without writing the library

### Requirement: Sources news

The sources service SHALL track per-repository state since last seen, run checks for new skills in watched repositories, and auto-add skills when configured.

#### Scenario: New skill appears in watched repo

- **WHEN** a source check finds a new skill path
- **THEN** the sources UI can offer adding it to the library according to repository rules

### Requirement: Origin linking

The origin service SHALL search local evidence and marketplace data to propose sources for skills lacking origin metadata and link chosen sources to library skills.

#### Scenario: Link origin from marketplace match

- **WHEN** the user confirms an origin candidate
- **THEN** the skill record stores the source reference used by future update checks
