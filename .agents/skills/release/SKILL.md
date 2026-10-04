---
name: release
description: Release a new version of Loadout. Suggests the next version from the commits since the last tag, waits for the user to confirm it, then bumps, checks, tags and pushes, waits for the installer builds, publishes the GitHub release (the desktop app and its update feed), which publishes the CLI to npm as @antick/loadout from GitHub Actions. Use only when the user asks to release, ship or publish a new version.
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
```

- Uncommitted changes: stop and ask the user whether to commit them first. Never stash, reset
  or drop them yourself.
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

The tag starts the **Release builds** workflow (`.github/workflows/release.yml`); nothing else
can start it. It refuses a tag that does not match `apps/desktop/package.json`, and attests
every file it builds (`gh attestation verify <file> --repo antick/loadout` checks one).

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

Installed copies of the app offer the update within six hours.

The landing page does not update on its own: it reads the newest release when Vercel builds it,
and the push in step 4 built it before this release was published. Publishing starts **Rebuild
the landing page** (`.github/workflows/deploy-landing.yml`), which calls a Vercel deploy hook:

```sh
gh run list --workflow deploy-landing.yml --limit 1
gh run watch <run-id> --exit-status               # a minute or two
```

Its run summary saying "No VERCEL_DEPLOY_HOOK_URL secret" means the hook is not set up: the page
keeps offering the previous version until the next push to `main`. Tell the user, with the steps
in "The landing page" below.

## 7. Watch the CLI reach npm

Publishing the release starts **Publish the CLI to npm** (`.github/workflows/publish-npm.yml`).
It builds the CLI from the tag and publishes `@antick/loadout` with a provenance statement,
through npm trusted publishing: no npm login or token on this machine.

```sh
gh run list --workflow publish-npm.yml --limit 1
gh run watch <run-id> --exit-status               # a few minutes
```

On failure, `gh run view <run-id> --log-failed`. An authentication error (`E401`, `E403`, or
"OIDC" in the message) means npm does not trust the workflow yet. The user fixes it once:

1. Go to https://www.npmjs.com/package/@antick/loadout/access
2. Under **Trusted Publisher**, choose **GitHub Actions**
3. Organization or user `antick`, repository `loadout`, workflow filename `publish-npm.yml`,
   environment left empty, then **Set up connection**

Then rerun it: `gh run rerun <run-id>`. A version already on npm is skipped, not an error.

## 8. Verify and report

```sh
gh release view --json tagName,isDraft,url           # the new tag, isDraft false
pnpm view @antick/loadout version                     # the new version; the registry can lag a minute
```

Report in a few lines: the version, the GitHub release URL, whether loadout.potion.sh was
rebuilt, the npm package URL
(`https://www.npmjs.com/package/@antick/loadout`), and that users update the CLI with
`pnpm add -g @antick/loadout@latest`. List anything that failed or was skipped.

## The landing page

Rebuilding loadout.potion.sh after a release needs a Vercel deploy hook, stored as a GitHub
secret. The user sets it up once:

1. Go to https://vercel.com, open the project that serves loadout.potion.sh, then
   **Settings** → **Git** → **Deploy Hooks**
2. Name it `GitHub release`, branch `main`, click **Create Hook**, and copy the URL
3. Go to https://github.com/antick/loadout/settings/secrets/actions and click
   **New repository secret**
4. Name `VERCEL_DEPLOY_HOOK_URL`, paste the URL as the secret, click **Add secret**

Then rebuild the page for the release just published: `gh workflow run deploy-landing.yml`.
