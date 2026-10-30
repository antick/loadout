# Agent notes for Loadout

## Architecture rules

Follow `docs/ARCHITECTURE.md`: shared types first, behaviour only in `packages/core`, renderer calls typed IPC, structured `AppError` codes, library lock for filesystem writes, and deploy ownership checks before removing agent paths.

## OpenSpec workflow

Product behaviour specs live under `openspec/specs/`. Use the OpenSpec skills in `.agents/skills/` (also mirrored under `.cursor/skills/`) for explore, propose, apply, update, sync, and archive steps. Run `pnpm run specs:check` before opening a spec change pull request.

Read `openspec/README.md` and `openspec/baseline.md` for layout and baseline expectations.

## Release

Publishing releases uses `.agents/skills/release/SKILL.md`.
