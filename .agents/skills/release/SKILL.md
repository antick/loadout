---
name: release
description: Release a new version of Loadout. Suggests the next version from the commits since the last tag, waits for the user to confirm it, then bumps, checks, tags and pushes, waits for the installer builds, publishes the GitHub release (the desktop app and its update feed) and publishes the CLI to npm as @antick/loadout. Use only when the user asks to release, ship or publish a new version.
disable-model-invocation: true
argument-hint: "[version, e.g. 0.3.0]"
---

# Release Loadout

One version number covers everything: `apps/desktop/package.json` is the single source. The
desktop installers, the update feed, the standalone CLI and the npm package `@antick/loadout`
all take their version from it. The user invoking this skill is their instruction to push and
publish; the only question to ask is the version.

Run every step from the repository root. Stop at the first step that fails, say what failed
and what to do, and do not carry on around it.

## 1. Check the ground

```sh
git fetch origin --tags
git status --short                     # must be empty: commit or stash first, never discard
git rev-parse --abbrev-ref HEAD        # must be main
gh auth status                         # GitHub CLI signed in to an account that can push
pnpm whoami                            # npm account with publish rights on @antick
```

- Uncommitted changes: stop and ask the user whether to commit them first. Never stash, reset
  or drop them yourself.
- `pnpm whoami` fails: the user runs `pnpm login` in their own terminal (it is interactive),
  then invokes this skill again.
- `git rev-list --count HEAD..origin/main` above 0: someone pushed; stop and say so.

## 2. Suggest the version and wait for confirmation

```sh
last=$(git describe --tags --abbrev=0 --match 'v*')      # e.g. v0.2.0
node -p "require('./apps/desktop/package.json').version"  # should equal $last without the v
git log "$last"..HEAD --no-merges --format='%s'
```

Nothing since the last tag: say there is nothing to release and stop.

Pick the next version from the Conventional Commit types since `$last`:

| Commits since the last tag                           | Before 1.0.0 | From 1.0.0 |
| ---------------------------------------------------- | ------------ | ---------- |
| any `!` after the type, or `BREAKING CHANGE` in body | minor        | major      |
| any `feat:`                                          | minor        | minor      |
| only `fix:`, `perf:`, `refactor:`, `docs:`, `chore:` | patch        | patch      |

If the user passed a version as the argument, suggest that one instead (it must be valid semver
and higher than the current version).

Show the user:

- the suggested version and the one-line reason (e.g. "3 feat commits, before 1.0.0: minor"),
- the commits since `$last`, grouped under Features, Fixes and Other,

then ask them to confirm it or give another version. **Do not change anything until they
answer.** Accept only a clear yes or an explicit version; anything else, ask again.

## 3. Bump, check, commit

Set `"version"` in `apps/desktop/package.json` to the confirmed version. Change nothing else:
the CLI, the npm package and the standalone builds read it from there.

```sh
pnpm install --frozen-lockfile
pnpm check                              # lint, format, typecheck, every test; must pass
git add apps/desktop/package.json
git commit -m "chore: release <version>"
```

A failing `pnpm check`: stop, undo the version edit (`git checkout apps/desktop/package.json`),
and report the failure. Do not release around it.

## 4. Push and tag

```sh
git push -u origin main
git tag "v<version>"
git push origin "v<version>"
```

The tag starts the **Release builds** workflow (`.github/workflows/release.yml`). It refuses a tag
that does not match `apps/desktop/package.json`.

## 5. Wait for the builds

```sh
gh run list --workflow release.yml --limit 3      # find the run for the new tag
gh run watch <run-id> --exit-status               # about 15 to 25 minutes
```

Watch it in the background if the agent supports that, and tell the user it is running.

On failure: `gh run view <run-id> --log-failed`, report the failing job and the error lines, and
stop. Do not publish anything. Do not delete or move the tag without asking the user.

The push to `main` also starts **CI** (`gh run list --workflow ci.yml --limit 1`). Wait for it
too before publishing. A test that fails on one system only and passes elsewhere may be a
flake: rerun just that job once (`gh run rerun <run-id> --failed`). Passing on the rerun, go on
and tell the user which test flaked; failing again, stop and report it.

## 6. Publish the desktop release

The workflow leaves a **draft**. Check it before publishing:

```sh
gh release view "v<version>" --json isDraft,assets --jq '{isDraft, assets: [.assets[].name]}'
```

It must hold `latest.json` and its signature `latest.json.sig`, a macOS DMG and ZIP, a Windows `.exe`, Linux AppImage and `.deb`
files, and the `loadout-cli-<version>-*` standalone executables with `SHA256SUMS`. Anything
missing: stop and report.

```sh
gh release edit "v<version>" --draft=false --latest
```

Installed copies of the app offer the update within six hours; the landing page links to the
latest release on its own.

## 7. Publish the CLI to npm

Build it from the tag itself, in a separate checkout, so nothing committed after the tag (or
left uncommitted) ends up in the package:

```sh
git worktree add "/tmp/loadout-v<version>" "v<version>"
cd "/tmp/loadout-v<version>"
pnpm install --frozen-lockfile
pnpm --filter @loadout/cli run pack:npm
node packages/cli/dist/npm/loadout.mjs --version         # must print <version>
cd packages/cli/dist/npm && pnpm publish --access public --no-git-checks
```

npm usually wants a second factor to publish:

- "requires additional authentication, but pnpm is not running in an interactive terminal":
  the agent cannot answer it. Give the user the two commands to run in their own terminal
  (`cd /tmp/loadout-v<version>/packages/cli/dist/npm` then
  `pnpm publish --access public --no-git-checks`), wait for them to say it is done, then go on.
- It asks for a one-time password: ask the user for the code and add `--otp <code>`.

npm never accepts a version twice; `EPUBLISHCONFLICT` means it is already published, so report
it and move on. Afterwards remove the checkout from the repository root:
`git worktree remove "/tmp/loadout-v<version>"`.

## 8. Verify and report

```sh
gh release view --json tagName,isDraft,url           # the new tag, isDraft false
pnpm view @antick/loadout version                     # the new version; the registry can lag a minute
```

Report in a few lines: the version, the GitHub release URL, the npm package URL
(`https://www.npmjs.com/package/@antick/loadout`), and that users update the CLI with
`pnpm add -g @antick/loadout@latest`. List anything that failed or was skipped.
