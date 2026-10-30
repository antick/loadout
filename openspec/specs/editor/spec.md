# editor

## Purpose

Editing skill files in the library, in agent folders, or in projects, with version history, changed-on-disk detection, and library-only structural file operations.

## Requirements

### Requirement: Edit targets

`EditorApi.target` SHALL resolve a `SkillLocation` to an edit target describing where files live, and `files` SHALL return entries with the main document first.

#### Scenario: Open library skill in editor

- **WHEN** the renderer requests `editor.files` for a library skill
- **THEN** the API returns every content file with paths relative to the skill root

### Requirement: Save with conflict detection

`EditorApi.saveFile` SHALL persist content atomically and SHALL throw `CHANGED_ON_DISK` when the on-disk hash differs from `baseHash` unless `overwrite` is set.

#### Scenario: External edit before save

- **WHEN** a file changes on disk after the editor loaded it
- **THEN** save fails with `CHANGED_ON_DISK` so the user can reconcile

### Requirement: File version history

The editor service SHALL keep up to twenty prior versions per file under the library `history/` tree and expose them through `fileVersions` and `readFileVersion`.

#### Scenario: User restores an older version

- **WHEN** the user reads a historical version id
- **THEN** the API returns the stored content for that version

### Requirement: Library-only create and delete

Create, rename, and delete file operations SHALL apply only to library skills and SHALL refresh copy deployments after each change; they SHALL refuse removing the main skill document.

#### Scenario: Delete auxiliary file in library skill

- **WHEN** `deleteFile` removes a non-main document
- **THEN** copy deployments of that skill update to match the library content
