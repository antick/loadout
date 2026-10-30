# agents-workspace

## Purpose

Built-in and custom coding agents, enabling or disabling them, agent workspace views of local skills, adoption into the library, and plugin-provided skills listings.

## Requirements

### Requirement: Agent registry

The agents registry SHALL resolve built-in agents and custom agents with configurable skills directories and project-relative skills paths, exposed through `AgentsApi.list`.

#### Scenario: Disable an agent

- **WHEN** `setEnabled` turns an agent off
- **THEN** Loadout undeploys every skill it placed in that agent's folder and returns removed skill names

### Requirement: Workspace listing

`WorkspaceApi.list` SHALL return every folder in an agent's global skills directory, marking which entries Loadout manages versus external installs.

#### Scenario: View agent workspace page

- **WHEN** the UI loads workspace data for an agent key
- **THEN** local skills include relative paths suitable for upload, pull, or delete actions

### Requirement: Upload and pull

The workspace service SHALL copy a local skill into the library on `upload`, and SHALL replace a local folder with the library version on `pull`, stashing prior content in Recently removed when needed.

#### Scenario: Pull library skill to agent folder

- **WHEN** `pull` succeeds
- **THEN** the agent folder matches the library skill and any replaced local-only files gain Recently removed ids for undo

### Requirement: Broken folder cleanup

`WorkspaceApi.broken` SHALL list agent folders that fail skill format expectations, and `deleteBroken` SHALL remove only entries currently classified as broken and not managed by Loadout.

#### Scenario: Delete broken folder

- **WHEN** `deleteBroken` runs on a broken relative path
- **THEN** the folder is removed from the agent directory and is not a managed deployment
