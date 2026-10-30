# projects

## Purpose

Registered project directories, per-agent project skills, instruction files scoped to projects, duplicate detection when linking folders, and project `skills.toml` lockfile workflows.

## Requirements

### Requirement: Project registry

`ProjectsApi` SHALL add, remove, reorder, and pin projects, track open counts, suggest unlinked workspaces from recent editor and Git activity, and expose per-project skill lists per agent.

#### Scenario: Add project by path

- **WHEN** `add` receives an absolute project path
- **THEN** the project appears in `list` with stable id and display metadata

### Requirement: Project skill lifecycle

The projects service SHALL create skills directly in project agent folders, push project skills to the library, pull library skills into the project, enable or disable project skills, and delete copies into Recently removed.

#### Scenario: Push project skill to library

- **WHEN** `pushToLibrary` succeeds
- **THEN** the library gains or updates a skill mapped from the project relative path

### Requirement: Skill suggestions

`ProjectsApi.suggestSkills` SHALL recommend library skills based on project technologies and file patterns, and SHALL allow dismissing suggestions per project.

#### Scenario: Dismiss a suggestion

- **WHEN** `setSuggestionDismissed` marks a skill dismissed
- **THEN** that skill no longer appears in suggestions for the project until re-enabled

### Requirement: Project skills file

The skills-file service SHALL plan, safety-check, apply, and unapply a project's `skills.toml` and `skills-lock.json` using the same safety and deploy rules as interactive installs.

#### Scenario: Apply skills file to project

- **WHEN** apply runs successfully on a valid lockfile
- **THEN** project agent folders match the declared skill set without modifying undeclared paths
