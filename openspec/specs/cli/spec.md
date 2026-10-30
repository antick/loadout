# cli

## Purpose

The `loadout` command-line interface sharing core behaviour with the desktop app, grouped commands for skills, agents, presets, projects, sources, git backup, and doctor diagnostics, with JSON-friendly output.

## Requirements

### Requirement: Command groups

The CLI SHALL register command groups from `packages/cli/src/commands/index.ts`: repo, agents, skills, sources, presets, project, removed, git, doctor, and completion.

#### Scenario: User runs top-level help

- **WHEN** the user runs `loadout --help`
- **THEN** the help text lists each command group and its subcommands

### Requirement: Skills operations parity

Skills subcommands SHALL cover list, install, deploy, update, scan, search, validate, duplicates, publish, usage, and related operations by calling the same core services as the desktop API.

#### Scenario: Deploy from CLI

- **WHEN** the user runs `loadout skills deploy` with skill and agent flags
- **THEN** core deploy runs and exit codes follow `exitCodeFor` mapping for errors

### Requirement: JSON output mode

Commands that support structured output SHALL emit JSON when requested so agents can parse results without scraping tables.

#### Scenario: List skills as JSON

- **WHEN** the user passes the documented JSON flag on `skills list`
- **THEN** stdout contains a JSON array of skill records

### Requirement: Doctor diagnostics

The doctor command SHALL aggregate health findings from `packages/core/src/health` into a single report suitable for terminal display.

#### Scenario: Run loadout doctor

- **WHEN** `loadout doctor` executes
- **THEN** the CLI prints grouped findings for deployments, sources, duplicates, and related checks
