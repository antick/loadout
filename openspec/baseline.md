# Existing-product baseline

## Provenance

Created from freshly fetched `origin/main` at
`b2da07713b873b199ed214837fca088a0353f054` on 2026-10-30.
The adoption branch `chore/openspec` was created from that revision.

This is a source-inspected baseline of core contracts. References to tests mean
existing coverage was identified, not that every test or UI workflow passed
during this adoption. See the pull request validation report for commands actually run.

## Coverage

| Existing area                                           | Baseline spec    | Remaining depth to audit                                           |
| ------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Electron shell, routes, IPC, renderer data flow         | desktop-shell    | Every command palette action, tray menu, and update toast path     |
| Skill library, tags, checks, duplicates, usage, publish | library          | Full marketplace publish flows and every duplicate merge edge case |
| Deploy, undeploy, batch apply, ownership                | deploy           | Every agent-specific folder layout and conflict combination        |
| Install, market, scan import                            | install          | Every archive and Git redirect or sparse checkout variant          |
| Skill editor and file history                           | editor           | Browser preview editor parity with Electron                        |
| Agents registry and agent workspace                     | agents-workspace | Every built-in agent default path and plugin listing               |
| Instruction files global and per project                | instructions     | Every supported instruction filename per agent                     |
| Presets import, export, apply                           | presets          | Large preset files and partial import failure recovery             |
| Projects and skills.toml lockfiles                      | projects         | Every skills-file safety and apply failure mode                    |
| Git backup, sync, conflicts, snapshots                  | backup-sync      | Multi-device conflict resolution under real remotes                |
| Updates, sources news, origin linking                   | updates-sources  | Background auto-update scheduling and every source type            |
| Safety scans and install gating                         | safety           | SkillSpector unavailable and partial scan recovery                 |
| CLI command groups and JSON output                      | cli              | Parity matrix for every desktop-only API surface                   |
| Storage, settings, diagnostics, repair                  | storage-system   | Library move failures and remove-all-data confirmation             |

Detailed feature prose remains in [docs/FEATURES.md](../docs/FEATURES.md) and
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), indexed in [source-inventory.md](source-inventory.md).
Being indexed is not equivalent to being fully specified or behaviorally verified.

## Known limits

- README and FEATURES describe more than the fourteen baseline specs spell out requirement by requirement.
- UI tests in `e2e/` cover browser preview flows; they are linked in the inventory but not exhaustively mapped to requirements yet.
- Landing page (`apps/landing`) is out of scope for these specs unless a change explicitly targets it.

When changing an affected area, reconcile live docs with verified code and update the spec and this gap record together.

## Completing and maintaining the baseline

For each row above, expand the named depth into observable requirements and
success, failure and recovery scenarios. Attach implementation and test references.
Add missing tests before claiming coverage. Mark an area fully audited only with
recorded evidence; do not mass-convert old plan tasks into completed requirements.
Keep proposed improvements in `changes/`, separate from what the current system actually does.
