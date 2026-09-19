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
- **Then:** decide whether to ship that id as the default (env `SKILLBOARD_GITHUB_CLIENT_ID`, or a
  constant) so users never see the field. Sign in once for real and confirm the private repository
  is created and the first backup pushes.
- **Code:** `packages/core/src/backup/github.ts`, `apps/desktop/src/renderer/src/features/backup/DeviceSignIn.tsx`

### 2. App updates

- **State:** the check only notifies. No release feed exists, so Settings says updates are not
  configured. There is no in-app installer.
- **To do:** pick where releases live, publish a JSON feed `{ "version", "url" }`, set
  `UPDATE_FEED_URL`. Then decide on in-app install (electron-updater needs signed builds — see 3).
- **Code:** `apps/desktop/src/main/updater.ts`, `apps/desktop/src/main/constants.ts`

### 3. Code signing and installers

- **State:** the unpacked macOS build runs, unsigned. `pnpm package` (dmg / zip / nsis / AppImage /
  deb) has never been run to the end.
- **To do:** Apple Developer ID + notarisation, Windows certificate; run `pnpm package` on each OS;
  add a release workflow.
- **Code:** `apps/desktop/electron-builder.yml`

## Verify (built, never exercised for real)

### 4. Click-through gaps in the real app

Checked against mock data only, never clicked in the running Electron app:

- [ ] Link project dialog → "Linked workspace" tab, and the native folder picker on every tab
- [ ] Library select mode: batch deploy, batch tags, batch update, batch delete
- [ ] Removal guard dialog while updating a Git skill whose new version deletes files
- [ ] Backup recovery dialog ("Use the remote backup") after unrelated histories or a rejected push
- [ ] Backup conflict list: keep mine / use remote / keep both
- [ ] Tray menu items (Show, Library, Install, Backup, Quit)
- [ ] Drag a real folder and a real `.zip` from Finder onto Install → This computer
- [ ] Marketplace tab: paging, contributor filter, search "Load more", install + "Deploy to agents…" toast
- [ ] Scan tab with skills present in several agent folders; Import one, Import all
- [ ] Settings: library location change + restart (the move happens on next launch), proxy, auto-update interval
- [ ] Agent control setup card on the Dashboard, then ask an agent to run the published CLI

Core logic behind all of these has tests; this is about the UI wiring.

### 5. Two real computers

- **State:** two-device sync, skill-aware merge and conflicts are tested against local bare
  repositories only. Backup to a real remote was click-tested from one machine.
- **To do:** connect two Macs to one private GitHub repository; edit different skills on each, then
  the same skill on both, rename on one + edit on the other; confirm the merge and the conflict UI.

### 6. Windows and Linux

- **State:** never run.
- **To check:** symlink → junction → copy fallback (`packages/core/src/deploy/engine.ts`), the
  `.cmd` CLI launcher (`packages/core/src/system/cli-publish.ts`), `safeStorage` without a keyring on
  Linux, window chrome without the macOS inset title bar, tray icon rendering, path compaction with
  `\`.

## Build

### 7. More languages

- **State:** every string goes through i18next; only English ships. The language setting already
  exists (`en | zh | hi`).
- **To do:** add `apps/desktop/src/renderer/src/locales/<code>.json` plus the per-feature files in
  `locales/<code>/`, register the language in `LANGUAGES` and load its bundles in `lib/i18n.ts`
  (today only `locales/en/*.json` is globbed).

### 8. CLI and saved tokens

- **State:** tokens are encrypted with the OS keychain through Electron `safeStorage`, which the CLI
  cannot read. `skillboard git sync` to an HTTPS + token remote only works from the app. SSH remotes
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

### 11. Sparse Git clones

- **State:** every clone is a full shallow clone. Fine for normal repositories, slow for very large
  monorepos when only one subfolder is wanted.
- **To do:** `clone --filter=blob:none --sparse` + `sparse-checkout set <subpath>` when a clean
  subpath is known, falling back to a full clone.
- **Code:** `packages/core/src/install/git-client.ts` (`checkout({ subpath })` is accepted and ignored today)

### 12. Agent logos

- **State:** agents show monogram badges with a deterministic tint. No brand logos ship.
- **To do (optional):** an icon map keyed by agent key with a monogram fallback; check each logo's
  licence first.
- **Code:** `apps/desktop/src/renderer/src/components/AgentAvatar.tsx`

### 13. UI interaction tests

- **State:** renderer tests cover pure logic only (filters, grouping, backup mode, agent groups).
- **To do:** Playwright against the built Electron app with a temp `HOME`, replaying the manual pass
  in item 4. The throwaway CDP scripts used for the manual pass were not kept.

## Small things

- [ ] `usePickFolder` exists twice (`hooks/mutations/library.ts` and `settings-page.ts`). Move one copy
      to `hooks/mutations/app.ts` and import it everywhere.
- [ ] Shared mutation hooks such as `useSetSetting` return the invalidation promise from `onSettled`,
      which delays per-call `onSuccess`. The backup hooks already use a fire-and-forget `refresh()`;
      apply the same pattern to the rest.
- [ ] `resolveUserPath` / `canonical()` in `packages/cli` duplicate helpers from core's `util/fs`.
      Export them from core and delete the copies.
- [ ] `skillboard --version` prints the CLI package version, not the app version.
- [ ] No `--dry-run` on `skills deploy` / `skills undeploy`.
- [ ] Dashboard stat-card subtitles truncate at narrow widths ("2 of 2 installed for an …").
- [ ] "Settings → Agents" links from the agent pages go to `/settings`; point them at
      `/settings?section=agents`.
- [ ] Marketplace search results are not cached (boards are, for 5 minutes).
- [ ] After "upload to library" of a brand-new skill fails to adopt, the library folder is kept and
      gets re-indexed as an orphan on the next start. Clean it up on failure.
- [ ] `docs/ARCHITECTURE.md` does not list `util/async.ts`.
