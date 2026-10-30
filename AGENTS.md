# Agent notes for Loadout

## Architecture rules

Follow `docs/ARCHITECTURE.md`: shared types first, behaviour only in `packages/core`, renderer calls typed IPC, structured `AppError` codes, library lock for filesystem writes, and deploy ownership checks before removing agent paths.

## OpenSpec workflow

Use the repository-local OpenSpec skills for future product planning and implementation.
Start with `openspec/README.md`, `openspec/baseline.md` and the affected specs.
Use `pnpm run specs` for the pinned CLI and read the relevant skill before using it.
For features and behavior changes, follow this workflow:

1. Read existing specs and active changes (`pnpm run specs list --specs` and
   `pnpm run specs list`). Reuse the applicable change instead of duplicating it.
2. Use `$openspec-explore` for investigation and `$openspec-propose` to capture the
   proposal, design, requirement scenarios and implementation tasks before coding.
3. Use `$openspec-apply-change` for authorized implementation. Keep task status
   current and use `$openspec-update-change` when planning decisions change.
4. Verify the real behavior, run `pnpm run specs:check`, and
   use `$openspec-sync-specs` to reconcile accepted deltas into current specs.
5. Use `$openspec-archive-change` only when the change and verification are complete.
   Report unresolved failures or coverage gaps rather than marking them complete.

Routine merges, dependency refreshes and documentation corrections that do not
change product behavior do not need an artificial product-change proposal. Preserve
existing OpenSpec artifacts and update guidance or evidence affected by that work.
Existing user authorization remains authoritative; setup does not introduce a new
approval requirement for work already requested.

Before changing an area with incomplete baseline coverage, inspect its current code,
behavior tests and linked docs. Capture verified existing behavior separately from the
proposed change. Historical plans are not proof of shipped functionality. Maintain
spec evidence and the source inventory, run `pnpm run specs:check`, and report gaps.
OpenSpec does not replace architecture, release, or commit rules below.

## Release

Publishing releases uses `.agents/skills/release/SKILL.md`.
