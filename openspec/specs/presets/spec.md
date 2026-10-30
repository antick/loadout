# presets

## Purpose

Named groups of library skills with per-agent toggles, one-click deploy to default agent folders, import and export of preset files, and deployment status reporting.

## Requirements

### Requirement: Preset CRUD and ordering

`PresetsApi` SHALL create, update, remove, and reorder presets and their member skills, persisting portable preset metadata alongside skills.

#### Scenario: Reorder presets in UI

- **WHEN** `reorder` receives a new id order
- **THEN** subsequent `list` returns presets in that order

### Requirement: Per-agent toggles

For each preset skill, the API SHALL expose per-agent enable toggles via `toggles` and `setToggle` that control which agents receive the skill when the preset is applied.

#### Scenario: Disable skill for one agent in preset

- **WHEN** `setToggle` marks a skill disabled for an agent
- **THEN** `applyToDefault` skips deploying that skill to that agent

### Requirement: Apply and remove from defaults

`applyToDefault` SHALL deploy enabled preset skills to switched-on agents using one-time copy semantics with the same conflict and dry run options as batch deploy, and `removeFromDefault` SHALL undo that deployment.

#### Scenario: Dry run preset apply

- **WHEN** `applyToDefault` runs with `dryRun: true`
- **THEN** the result reports planned deploy counts without writing agent folders

### Requirement: Preset import and export

The preset share service SHALL export a preset file with skill sources or embedded files, preview imports, install missing skills, and create the preset while honouring safety acceptance flags.

#### Scenario: Import flags unsafe skill

- **WHEN** preview shows an unsafe skill and `acceptRisk` is unset
- **THEN** `importFile` fails with UNSAFE and leaves partial installs as documented in the API contract
