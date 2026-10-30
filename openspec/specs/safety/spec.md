# safety

## Purpose

Built-in safety rules and optional SkillSpector scans before installs, with library-wide scan progress and retained reports per skill.

## Requirements

### Requirement: Pre-install safety gate

Every install path that accepts `InstallOptions` SHALL run the safety pipeline and SHALL refuse installation with UNSAFE when a flagged skill is selected unless `acceptRisk` is set.

#### Scenario: Confirm Git preview with flagged skill

- **WHEN** `confirmGit` includes a ticked unsafe skill without `acceptRisk`
- **THEN** nothing is installed and the preview remains available

### Requirement: SkillSpector status

`SafetyApi.status` SHALL report whether SkillSpector is available and configured, and `scanSkill` SHALL store a `SafetyRecord` for a library skill.

#### Scenario: Scan one skill from library UI

- **WHEN** `scanSkill` completes
- **THEN** `list` includes the updated record for that skill id

### Requirement: Library scan batch

`SafetyApi.scanLibrary` SHALL scan skills lacking reports or stale reports, emitting progress on `install:progress` under the library scan key, and SHALL rescan all skills when `force` is true.

#### Scenario: Force full library rescan

- **WHEN** `scanLibrary(true)` runs
- **THEN** every library skill receives a fresh scan result

### Requirement: Built-in rules

The safety module SHALL apply built-in rules from `packages/core/src/safety` before external scanner results and SHALL integrate with install plan confirmation in core.

#### Scenario: Install blocked by built-in rule

- **WHEN** a built-in rule marks a source unsafe
- **THEN** install confirmation requires explicit risk acceptance like scanner flags
