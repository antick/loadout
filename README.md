# Loadout

One desktop app to manage AI agent skills across every coding tool.

A skill is a folder with a `SKILL.md`. Loadout keeps every skill in one library
(`~/.loadout`) and deploys it, by symlink or copy, into the skills folder of each agent you
use: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and more than 60 others.

![Loadout dashboard: skills in the library, deploy coverage, connected agents and recent activity](docs/screenshots/dashboard.png)

## Install

Download the installer for your system from the
[latest release](https://github.com/antick/loadout/releases/latest).

The builds are not signed with an Apple or Windows certificate yet, so macOS and Windows ask
for one extra click the first time. [docs/INSTALL.md](docs/INSTALL.md) says which file to pick
and exactly what to click on macOS, Windows and Linux. After the first start, Loadout updates
itself.

## Screenshots

**Library.** Every skill in one place, with its source, tags and the agents it is deployed to.

![The library: skill cards with tags and one badge per agent](docs/screenshots/library.png)

**A skill.** The rendered `SKILL.md`, its files, where it came from, and switches per agent.

![A skill's panel: its document, files, source and tags](docs/screenshots/skill-detail.png)

**Editor.** Edit any file of a skill with a live preview. Every save keeps the version it replaced.

![The editor: the skill's files, the Markdown source and its preview side by side](docs/screenshots/editor.png)

**An agent.** Everything in the agent's skills folder, its instruction file, and presets to apply in one click.

![Claude Code's page: its skills, sync status and presets](docs/screenshots/agent-workspace.png)

**A project.** Skills that live inside a project, per agent, with the project's instruction files.

![A project's page: its skills and instruction files for each agent](docs/screenshots/project.png)

**Install.** Browse the skills.sh marketplace, or install from a folder, a `.zip`, a Git repository or a link.

![The marketplace: popular skills with one-click install](docs/screenshots/marketplace.png)

**Colours.** Four palettes (Flight gear, Blueprint, Risograph, Iris & butter), each with a light and a dark version. Pick one in Settings or from the status bar; Loadout remembers it.

![The palette picker in Settings: four palettes, each shown in light and dark](docs/screenshots/palettes.png)

![The library in Flight gear's dark mode](docs/screenshots/library-dark.png)

## Features

- **Library:** one folder for every skill, with search, tags, filters, batch actions and checks against the Agent Skills format.
- **Editor:** edit any file of a skill with a live preview, the last 20 versions kept, and no silent overwrite of changes made on disk.
- **Install:** from a folder, an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`), a download link, a Git repository (Git itself is optional) or the skills.sh marketplace.
- **Agents:** 69 agents built in and found automatically, plus custom agents, custom folders and agents inside WSL.
- **Deploying:** give a skill to any agent in one click, by symlink or copy, without ever touching a folder Loadout didn't create.
- **Instruction files:** edit `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the rest, globally and per project.
- **Agent workspaces:** see everything in an agent's skills folder, compare it with the library, and adopt skills installed elsewhere.
- **Subagents, commands and rules:** keep them in the library too, and deploy them to each agent in its own format, globally or into a project.
- **Presets:** named groups of skills you turn on for an agent or a project in one click.
- **Projects:** manage the skills inside each project, per agent, and keep them in step with the library.
- **Skill updates:** check sources on a schedule, see what an update would change, then update one skill or all of them.
- **Backup and sync:** back the library up to a private Git repository and keep several computers in step, with conflicts you resolve.
- **Command line:** a `loadout` CLI with JSON output, and a bundled skill that lets your agents manage skills themselves.
- **App updates:** Loadout updates itself and checks every download against the release checksum.
- **Storage:** everything lives in `~/.loadout`, with sizes, clean-up, a movable library and a remove-everything button.
- **App:** dashboard, command palette (`⌘K`), keyboard shortcuts, four colour palettes in light and dark, tray icon and status bar.

Every feature in detail, current limitations and what still needs testing:
[docs/FEATURES.md](docs/FEATURES.md).

## Run locally

1. Install Node.js 22.13 or newer and Git. Then let Node's Corepack provide the pnpm version
   pinned in the `packageManager` field of [package.json](package.json):

   ```bash
   corepack enable
   ```

2. Open a terminal in the folder where you cloned this repository.

3. Confirm the tools are available:

   ```bash
   node --version
   pnpm --version
   git --version
   ```

4. Install the project dependencies:

   ```bash
   pnpm install
   ```

5. Start the app:

   ```bash
   pnpm dev
   ```

   This builds the CLI and opens the Electron desktop app with development reload.
   Keep the terminal running. The real app opens in its own window; you do not need
   to open a browser or start a separate backend.

6. Stop development with `Ctrl+C` in that terminal. Run `pnpm dev` again next time.

No `.env` file or GitHub sign-in is required for basic local use. The default library
is `~/.loadout`; development uses your real library and agent folders.

## First use

1. If the first-run backup prompt appears, choose to start fresh or restore an existing backup.
2. Open **Install** and import a local folder/archive, a Git repository, or a marketplace skill.
3. Open **Agents**, select an agent, and use **Add Skills** to deploy skills from the library.
   Installing into the library alone does not deploy a skill to an agent.
4. Use **Presets** to group skills, or add a project to manage its project-local skills.
5. Optionally configure Git backup. A personal access token or Git remote URL works now;
   GitHub device sign-in requires an OAuth Client ID in **Settings → Backup**.

## CLI examples

Run these from the repository root:

```bash
pnpm cli --help
pnpm cli skills list
pnpm cli agents list
pnpm cli skills install /path/to/my-skill
pnpm cli skills deploy my-skill --agent claude_code --agent codex
pnpm cli skills status my-skill
```

Replace the example path, skill name and agent keys with your own. The app also publishes
the CLI to `~/.loadout/bin/loadout` when it starts. To let an agent manage skills,
use the agent-control setup card on the Dashboard.

Without the app, install the CLI from npm (Node.js 22.13 or newer):

```bash
pnpm add -g @antick/loadout
loadout --help
```

## Development commands

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `pnpm dev`     | Build the CLI, then start the app with reload |
| `pnpm check`   | oxlint, oxfmt check, typecheck, all tests     |
| `pnpm test`    | vitest across packages                        |
| `pnpm build`   | Build the CLI and desktop app                 |
| `pnpm format`  | Format with oxfmt                             |
| `pnpm package` | Build installers into `apps/desktop/release`  |
| `pnpm cli …`   | Run the CLI from source                       |

To try the interface in a browser without touching your own library, run
`pnpm --filter @loadout/desktop dev:browser` and open the address it prints. It serves the
renderer on the real core, without Electron, on a temporary home folder seeded with skills,
agents, projects, presets and a backup. Dialogs, the shell and app updates are stand-ins there.
The temporary home is removed when the server stops.

`pnpm check` leaves out the UI tests, which click through that browser preview in headless
Chromium with Playwright, each worker on its own seeded home that goes back to the seed before
every test. Run them with `pnpm --filter @loadout/desktop test:ui`, after installing the
browser once with `pnpm --filter @loadout/desktop exec playwright install chromium`.

## Website

`apps/landing` is the landing page at [loadout.potion.sh](https://loadout.potion.sh), an Astro
static site. `pnpm --filter @loadout/landing run dev` serves it while you work on it, and
`pnpm exec turbo run build --filter=@loadout/landing` builds it. Vercel builds and
serves it from `vercel.json`; links such as where installers are downloaded live in
`apps/landing/src/lib/site.ts`. The agent list on the page comes from `@loadout/shared`, so it
always matches the app. The direct download links are read from the newest release's
`latest.json` at build time; the tests build with `astro build --mode offline`, which skips that
and links to the release page, so they never wait on the network.

## Releases

For every push to `main` and every pull request, GitHub Actions runs the linter, the format check
and the type check once on Linux, the tests on Linux, macOS and Windows, and the UI tests on Linux
(`.github/workflows/ci.yml`).

Installers are published as GitHub releases of this repository. The app's update check reads
`latest.json` from the newest published release, and the landing page links there.

`.github/workflows/release.yml` builds macOS (Apple Silicon and Intel, DMG and ZIP), Windows
(NSIS installer) and Linux (AppImage and DEB, x64 and arm64) installers and the standalone CLI
executables. It then writes `latest.json` (version, and per system the download link, size and
SHA-256) with `apps/desktop/scripts/update-feed.mjs`, and puts everything in a **draft** release.

### Cut a release

Every step, from picking the version to checking npm, is in the release skill,
[.agents/skills/release/SKILL.md](.agents/skills/release/SKILL.md). Ask an agent to run it
(`/release`), or follow it by hand.

Publishing the draft puts the release live: running copies of Loadout offer it within six hours,
and a draft is invisible to users and to the update check. Don't mark a release as a
pre-release: the update check only sees the newest full release.

The workflow signs `latest.json` with an ed25519 key (repository secret
`UPDATE_FEED_SIGNING_KEY`) and uploads `latest.json.sig`. From 0.2.1 on, the app ignores a feed
without a valid signature from that key; its public half is `UPDATE_FEED_PUBLIC_KEY` in
`packages/shared/src/constants.ts`. Keep a copy of the private key somewhere safe (a password
manager): losing it means shipping one more release signed with it that carries a new public
key, which is impossible without it.

### The CLI on npm

Publishing a release also publishes the CLI of that tag to npm as `@antick/loadout`
(`.github/workflows/publish-npm.yml`). No npm token is stored: npm trusts that workflow through
trusted publishing. A failed run can be re-run from the Actions tab.

### The landing page

The landing page takes its version and installer links from the newest published release when
it is built, and Vercel builds it on pushes to `main`, before the release is published. So
publishing a release also has Vercel rebuild it through a deploy hook
(`.github/workflows/deploy-landing.yml`, repository secret `VERCEL_DEPLOY_HOOK_URL`). Without the
secret that run only leaves a notice, and the page offers the previous version until the next
push to `main`.

### Test an update locally

Updates can be tried end to end on one Mac without publishing anything:

1. Build two versions: `pnpm build`, then in `apps/desktop` run
   `pnpm exec electron-builder --config electron-builder.yml --mac zip --arm64 --publish never`
   once as is and once with `-c.extraMetadata.version=0.1.1` added.
2. Unzip the older zip somewhere you can write to, with `ditto -x -k <zip> <folder>`.
3. Put the newer zip in its own folder. Write its feed with
   `node apps/desktop/scripts/update-feed.mjs <folder> --version 0.1.1 --base-url http://127.0.0.1:8765`,
   and serve the folder with `python3 -m http.server 8765 --bind 127.0.0.1`.
4. Start the older app with `LOADOUT_UPDATE_FEED=http://127.0.0.1:8765/latest.json` set, and click
   **Update**, then **Restart now**.

`LOADOUT_UPDATE_FEED` is also the only way a development build (`pnpm dev`) checks for updates;
a development build never replaces itself.

## Layout

| Path              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `apps/desktop`    | Electron main, preload and the React renderer      |
| `apps/landing`    | Landing page at loadout.potion.sh                  |
| `packages/core`   | All behaviour, plain Node TypeScript (no Electron) |
| `packages/cli`    | The `loadout` command-line tool                    |
| `packages/shared` | Types, API contract, events, settings, formatters  |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the rules and
[docs/FEATURES.md](docs/FEATURES.md) for every feature.

## License

Loadout is free software under the [GNU General Public License v3.0](LICENSE) (`GPL-3.0-only`).
You may use, change and share it. If you distribute it or a changed version, you must share the
source under the same license.
