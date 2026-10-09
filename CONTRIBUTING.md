# Contributing

Setup and commands are in the [README](README.md#run-locally). How the code is laid out, and the
rules it follows, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Before you open a pull request

1. Run `pnpm check`. It runs the linter, the format check, the type check and every test. CI runs
   the same checks on Linux and the tests on Linux and macOS.
2. Add a test for what you changed. CLI commands are tested through `packages/cli/test/harness.ts`,
   which runs them in-process against a throwaway home folder.
3. Keep `docs/FEATURES.md` current: one short line per feature.
4. Keep the rules in ARCHITECTURE.md: behaviour lives in `packages/core`, types and constants in
   `packages/shared`, dates through the shared formatter, files at or under 500 lines.

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `type: imperative summary`, lowercase
after the type, no trailing full stop, about 72 characters. For example `fix: keep tags when a skill is renamed`.

## Dependencies

Pin every dependency to an exact version. Use `pnpm`, not npm or yarn.

## Reporting bugs

Use the issue form. In the app, Settings → About → Copy diagnostics gives the details it asks for,
with home folder names, tokens and e-mail addresses removed. Security problems go through
[SECURITY.md](SECURITY.md), never a public issue.
