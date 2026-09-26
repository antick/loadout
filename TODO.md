# TODO

Pending work, in rough priority order. Each item says what is missing, where the code lives and
what "done" looks like, so it can be picked up cold. The feature checklist is in
[docs/PLAN.md](docs/PLAN.md); the rules are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Last full pass: 2026-09-19. `pnpm check` clean (390 tests), app click-tested on macOS arm64.

## Needs a decision or an account (blocked on Pankaj)

### 1. GitHub "Sign in with GitHub" button

- **State:** built, hidden. Device sign-in only shows once an OAuth client id exists. A personal
  access token and any Git URL already work.
- **To unblock:**
  1. github.com/settings/developers → OAuth Apps → New OAuth App
  2. Tick "Enable Device Flow"
  3. Paste the Client ID into Settings → Backup in the app
- **Then:** decide whether to ship that id as the default (env `LOADOUT_GITHUB_CLIENT_ID`, or a
  constant) so users never see the field. Sign in once for real and confirm the private repository
  is created and the first backup pushes.
- **Code:** `packages/core/src/backup/github.ts`, `apps/desktop/src/renderer/src/features/backup/DeviceSignIn.tsx`

### 2. Test a self-update on Windows and Linux

- **State:** self-update was tested end to end on macOS arm64, from a local feed and from the
  published release. The Windows silent reinstall, the AppImage replacement and the `.deb`
  handoff have never run on those systems.
- **To do:** install the previous release on Windows and on Linux (AppImage and `.deb`), publish a
  newer one, and click **Update**, then **Restart now**. `docs/INSTALL.md` is what users follow.
- **Code:** `apps/desktop/src/main/update/`

### 3. Code signing

- **State:** macOS builds carry an ad-hoc signature (`identity: "-"`), so macOS offers "Open
  Anyway" instead of calling the app damaged. Windows builds are unsigned. `docs/INSTALL.md`
  walks users through both warnings. The self-updater does not need signing.
- **To do (optional):** an Apple Developer ID plus notarisation removes the macOS warning. Set
  `mac.identity` to the certificate name, turn `hardenedRuntime` back on, add `notarize`. A Windows
  certificate removes SmartScreen. The updater keeps working unchanged after either.
- **Code:** `apps/desktop/electron-builder.yml`

## Verify (built, never exercised for real)

### 4. Click-through gaps in the real app

Checked against mock data only, never clicked in the running Electron app:

- [ ] Link project dialog → "Linked workspace" tab, and the native folder picker on every tab
- [ ] Library select mode: batch deploy, batch tags, batch update, batch delete
- [ ] Removal guard dialog while updating a Git skill whose new version deletes files
- [ ] Backup recovery dialog ("Use the remote backup") after unrelated histories or a rejected push
- [ ] Backup conflict list: keep mine / use remote / keep both
- [ ] Tray menu: counts line, "N skill updates available", Presets submenu (deploy / remove /
      partial count), Check for skill updates, Open library folder, Show, Library, Install, Backup, Quit
- [ ] Drag a real folder and a real `.zip` from Finder onto Install → This computer
- [ ] Marketplace tab: paging, contributor filter, search "Load more", install + "Deploy to agents…" toast
- [ ] Scan tab with skills present in several agent folders; Import one, Import all
- [ ] Settings: library location change + restart (the move happens on next launch), proxy, auto-update interval
- [ ] Agent control setup card on the Dashboard, then ask an agent to run the published CLI
- [ ] Export as .zip: the native "Save as" dialog (single skill, batch), then "Show file" selects
      the file in Finder / Explorer instead of opening it
- [ ] Choose or drop a real `.zip` holding several skills on Install → This computer: the picker opens
- [ ] Git or link tab with a real `.zip` link and with Git uninstalled (the "Git is not installed" note)

Core logic behind all of these has tests; this is about the UI wiring.

### 5. Two real computers

- **State:** two-device sync, skill-aware merge and conflicts are tested against local bare
  repositories only. Backup to a real remote was click-tested from one machine.
- **To do:** connect two Macs to one private GitHub repository; edit different skills on each, then
  the same skill on both, rename on one + edit on the other; confirm the merge and the conflict UI.

### 6. Windows and Linux

- **State:** the check suite runs on Windows in CI (`.github/workflows/ci.yml`); the app itself
  has never been run there.
- **To check:** symlink → junction → copy fallback (`packages/core/src/deploy/engine.ts`), the
  `.cmd` CLI launcher (`packages/core/src/system/cli-publish.ts`), `safeStorage` without a keyring on
  Linux, window chrome without the macOS inset title bar, tray icon rendering, path compaction with
  `\`.
- **WSL agents** (built, unit-tested on macOS only): add a custom agent at
  `\\wsl.localhost\<distro>\home\<you>\.claude\skills`, deploy a skill, and confirm a copy
  (not a link) lands there, Claude Code inside WSL sees it, saving in the editor refreshes it, and
  the folder watcher neither errors nor misses changes on the UNC path.
  Code: `packages/shared/src/wsl.ts`, `usableMode` in `packages/core/src/deploy/engine.ts`.

## Build

### 7. More languages

- **State:** every string goes through i18next; only English ships. The language setting already
  exists (`en | zh | hi`).
- **To do:** add `apps/desktop/src/renderer/src/locales/<code>.json` plus the per-feature files in
  `locales/<code>/`, register the language in `LANGUAGES` and load its bundles in `lib/i18n.ts`
  (today only `locales/en/*.json` is globbed).

### 8. CLI and saved tokens

- **State:** tokens are encrypted with the OS keychain through Electron `safeStorage`, which the CLI
  cannot read. `loadout git sync` to an HTTPS + token remote only works from the app. SSH remotes
  and git credential helpers work from both.
- **Options:** have the CLI ask the running app over a local socket, or store the token with the
  OS keychain CLI (`security`, `secret-tool`) instead of `safeStorage`.
- **Code:** `apps/desktop/src/main/secrets.ts`, `packages/core/src/backup/credentials.ts`

### 9. Recover an interrupted backup merge

- **State:** a leftover `MERGE_HEAD` or `index.lock` stops sync with a clear error; the user fixes it
  with "Use the remote backup".
- **To do:** on start, detect the leftover state, abort the merge (`git merge --abort`), remove a
  stale lock owned by a dead process, and retry.
- **Code:** `packages/core/src/backup/repo.ts`, `merge.ts`

### 10. Portable metadata written outside the lock

- **State:** `ctx.touched()` flushes `portable.write()` on the next tick without the library lock. A
  UI change landing in the few milliseconds a merge spends writing metadata could drop an incoming
  skill's metadata file. No data is lost: the folder is re-indexed as an imported skill with a new id.
- **To do:** take the lock with `tryRun` for the flush, or skip the flush while a backup operation
  holds the lock and flush when it ends.
- **Code:** `packages/core/src/create-context.ts`

### 11. Sparse Git clones (done)

- **State:** clones are partial (`--filter=blob:limit=256k`): files over 256 KB arrive only when
  needed. Previews, marketplace installs and updates check out only the `SKILL.md` files, then
  fetch the chosen skill folders (`checkout({ manifestsOnly })` + `materialize`). Falls back to
  every file when Git is older than 2.35 or the server ignores the filter.
- **Left:** `checkout({ subpath })` is still accepted and unused; `manifestsOnly` replaced it.
  Never timed on a slow corporate proxy.
- **Code:** `packages/core/src/install/git-client.ts`, `git-sparse.ts`

### 12. Agent logos

- **State:** agents show monogram badges with a deterministic tint. No brand logos ship.
- **To do (optional):** an icon map keyed by agent key with a monogram fallback; check each logo's
  licence first.
- **Code:** `apps/desktop/src/renderer/src/components/AgentAvatar.tsx`

### 13. UI interaction tests

- **State:** renderer tests cover pure logic only (filters, grouping, backup mode, agent groups).
- **To do:** Playwright against the built Electron app with a temp `HOME`, replaying the manual pass
  in item 4. The throwaway CDP scripts used for the manual pass were not kept.

### 14. Skill editor follow-ups

The editor (`/library/$skillId/edit`) shipped without these. Each one is a separate piece of work.

- [ ] **File management.** The editor only changes files that already exist: no create, rename or
      delete.
  - **To do:** "New file" and "New folder" in the file list, rename and delete from a right-click
    menu. Deleting keeps the file as an earlier version first. Every change goes through core
    (`skills.createFile`, `renameFile`, `deleteFile`), updates `editedFiles` and the content hash,
    refreshes copy deployments like a save does, and never touches the main document's existence
    (a skill without `SKILL.md` stops being a skill).
  - **Code:** `packages/core/src/editor/files.ts`, `packages/core/src/editor/service.ts`, `apps/desktop/src/renderer/src/features/editor/EditorFileList.tsx`
- [ ] **Edits made outside the app are not tracked.** Only saves made in the editor are recorded
      in `editedFiles`, so an update replaces a hand edit of the library folder without asking.
  - **To do:** remember the content hash each skill had right after it last came from its source
    (new column, set by `installIntoLibrary`). A different hash later means the library was changed
    by someone; list the changed files in the update guard as edits. Hand edits then get the same
    protection as editor saves.
  - **Code:** `packages/core/src/install/library.ts`, `packages/core/src/updates/update.ts`, `packages/core/src/db/schema.ts`
- [ ] **Local-folder skills show "Update available" after an edit.** For a skill installed from a
      folder, the check compares the folder with the library, so an edit in the app looks like an
      upstream change. Re-importing then asks before replacing the edit, so nothing is lost, but the
      badge is misleading.
  - **To do:** with the "installed hash" above, report `update_available` only when the source
    folder differs from what was installed, not from the edited library copy.
  - **Code:** `packages/core/src/updates/check.ts` (`localFinding`)
- [ ] **Mixed line endings.** A file that mixes CRLF and LF is saved with whichever ending most of
      its lines use, so its other lines change on the first save.
  - **To do:** keep the ending of each untouched line (diff the saved text against the original
    lines), or at least say so in the status bar before the first save.
  - **Code:** `packages/core/src/editor/text-file.ts`
- [ ] **Not tested yet.** The editor was click-tested on macOS only. The update guard for edits
      is covered by core tests against a local Git fixture, never against a real remote update.
  - **To check:** on Windows and Linux, saving keeps CRLF files and file permissions as they were,
    and copies refresh; on any OS, edit a skill installed from a real GitHub repository, push an
    upstream change, and confirm Update lists "Your edits" and the automatic update holds it back.

## Small things

- [ ] `usePickFolder` exists twice (`hooks/mutations/library.ts` and `settings-page.ts`). Move one copy
      to `hooks/mutations/app.ts` and import it everywhere.
- [ ] Shared mutation hooks such as `useSetSetting` return the invalidation promise from `onSettled`,
      which delays per-call `onSuccess`. The backup hooks already use a fire-and-forget `refresh()`;
      apply the same pattern to the rest.
- [ ] `resolveUserPath` / `canonical()` in `packages/cli` duplicate helpers from core's `util/fs`.
      Export them from core and delete the copies.
- [ ] `loadout --version` prints the CLI package version, not the app version.
- [ ] No `--dry-run` on `skills deploy` / `skills undeploy`.
- [ ] Dashboard stat-card subtitles truncate at narrow widths ("2 of 2 installed for an …").
- [ ] After "upload to library" of a brand-new skill fails to adopt, the library folder is kept and
      gets re-indexed as an orphan on the next start. Clean it up on failure.
