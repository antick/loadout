# OpenSpec in Loadout

Loadout uses [OpenSpec](https://openspec.dev) for spec-driven changes. The baseline specs in `openspec/specs/` describe what the app and CLI do today.

## Layout

| Path                         | Role                                              |
| ---------------------------- | ------------------------------------------------- |
| `config.yaml`                | Schema and optional project context for workflows |
| `specs/<capability>/spec.md` | Baseline requirements for one product area        |
| `changes/`                   | In-flight proposals (empty until the next change) |
| `changes/archive/`           | Completed changes after archive                   |
| `baseline.md`                | How the baseline was captured                     |
| `source-inventory.md`        | Code paths traced for each capability             |

## Commands

From the repository root:

```bash
pnpm run specs        # list specs and changes
pnpm run specs:check  # strict validation (CI-friendly)
```

Workflow skills live under `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, and `.dsh/skills/` (for example `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`).

## Capabilities

Each folder under `openspec/specs/` maps to a major area of Loadout: desktop shell, library, deploy, install, editor, agents workspace, instructions, presets, projects, backup sync, updates and sources, safety, CLI, and storage or system services.
