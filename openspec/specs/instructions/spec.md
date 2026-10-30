# instructions

## Purpose

Global and per-project instruction files such as `CLAUDE.md` and `AGENTS.md` for supported agents, listed for editing through the shared editor pipeline.

## Requirements

### Requirement: Instruction file listing

`InstructionsApi.list` SHALL return one entry per distinct instruction file for the enabled agents, using a null `projectId` for global files and a project id for project-scoped files.

#### Scenario: List global instructions

- **WHEN** `list(null)` is called
- **THEN** the API returns known instruction filenames even when a file does not exist yet

### Requirement: Create on first save

Instruction entries for files that do not exist yet SHALL open as new in the editor, and the first save SHALL create the file on disk.

#### Scenario: New AGENTS.md in a project

- **WHEN** the user saves a new instruction file for a project
- **THEN** the file appears at the project path configured for that agent

### Requirement: Editor reuse

Instruction files SHALL be edited through the same `EditorApi` read and save paths as skill documents, respecting changed-on-disk detection.

#### Scenario: Save instruction edit

- **WHEN** the user saves instruction content from the instructions editor route
- **THEN** the write uses `editor.saveFile` semantics for the resolved location
