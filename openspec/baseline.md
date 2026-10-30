# Existing product baseline

This repository adopted OpenSpec with a one-time baseline of the shipping Loadout product. The files under `openspec/specs/<capability>/spec.md` describe current behaviour only. They were derived from `packages/shared/src/api.ts`, `packages/core` services, desktop routes, CLI command groups, and `docs/ARCHITECTURE.md` and `docs/FEATURES.md`.

Future work should use the spec-driven change workflow: propose a change under `openspec/changes/`, implement against its tasks, then archive so deltas merge into these baseline specs.

Do not treat this baseline as a roadmap. Requirements that are not implemented in the codebase must not appear here.
