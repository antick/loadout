# Dependency upgrade review

Checked npm metadata on 2026-10-18T04:14:45.667Z. Direct dependency versions were selected from releases published before
2026-10-16T04:14:45.667Z (48 hours before the check). Direct dependencies remain exactly pinned;
workspace links remain `workspace:*`. The lockfile is regenerated with pnpm.

## Version changes

| Dependency              | Previous        | Selected | Published (UTC)          |
| ----------------------- | --------------- | -------- | ------------------------ |
| @playwright/test        | 1.64.0          | 1.64.1   | 2026-10-14T11:58:13.696Z |
| @tanstack/react-query   | 5.104.1         | 5.104.3  | 2026-10-15T07:53:35.788Z |
| @tanstack/react-router  | 1.170.41        | 1.170.44 | 2026-10-12T23:58:15.565Z |
| @tanstack/router-plugin | 1.168.42        | 1.168.46 | 2026-10-14T14:54:56.118Z |
| @types/node             | 26.6.5, 22.20.5 | 26.6.5   | 2026-10-09T18:46:47.657Z |
| astro                   | 7.3.8           | 7.4.0    | 2026-10-15T14:49:24.327Z |
| electron                | 44.7.0          | 44.8.0   | 2026-10-16T02:53:46.684Z |
| electron-builder        | 26.15.3         | 26.17.0  | 2026-09-26T09:53:06.506Z |
| electron-vite           | 6.0.0-beta.7    | 6.0.0    | 2026-10-14T16:05:05.464Z |
| i18next                 | 26.4.2          | 26.4.6   | 2026-10-15T17:53:59.959Z |
| lucide-react            | 1.54.0          | 1.57.0   | 2026-10-14T06:11:42.974Z |
| oxfmt                   | 0.72.0          | 0.73.0   | 2026-10-13T09:47:24.473Z |
| oxlint                  | 1.87.0          | 1.88.0   | 2026-10-13T09:47:46.926Z |
| radix-ui                | 1.7.0           | 1.8.1    | 2026-10-12T21:03:38.918Z |
| react                   | 19.3.0          | 19.3.1   | 2026-10-14T16:47:15.290Z |
| react-dom               | 19.3.0          | 19.3.1   | 2026-10-14T16:49:10.081Z |
| react-i18next           | 17.0.16         | 17.0.18  | 2026-10-15T18:30:49.935Z |
| turbo                   | 2.11.7          | 2.11.8   | 2026-10-13T18:09:37.180Z |
| vitest                  | 5.0.3           | 5.0.5    | 2026-10-15T14:29:01.396Z |

## Releases deferred by the two-day rule

| Dependency              | Newest at review | Published (UTC)          | Selected instead |
| ----------------------- | ---------------- | ------------------------ | ---------------- |
| @tanstack/react-query   | 5.104.4          | 2026-10-17T17:55:14.077Z | 5.104.3          |
| @tanstack/react-router  | 1.170.45         | 2026-10-16T21:11:23.380Z | 1.170.44         |
| @tanstack/router-plugin | 1.168.47         | 2026-10-16T21:10:39.573Z | 1.168.46         |
| electron                | 44.9.0           | 2026-10-17T05:50:07.885Z | 44.8.0           |
| i18next                 | 26.5.2           | 2026-10-17T21:24:19.266Z | 26.4.6           |
| lucide-react            | 1.59.0           | 2026-10-17T06:15:48.758Z | 1.57.0           |
| react-i18next           | 17.1.0           | 2026-10-17T19:01:17.902Z | 17.0.18          |
| turbo                   | 2.11.9           | 2026-10-16T19:07:34.393Z | 2.11.8           |

## Package manager held back

pnpm 12.14.0 and 12.13.0 stalled on a single registry query in this environment.
The workspace install also stalled with 12.14.0, while the existing 12.4.2 completed
the same upgraded dependency install in 38 seconds. Keep the proven 12.4.2 pin in
package.json and mise.toml rather than including an unverified toolchain upgrade.

## Compatibility

- React and React DOM move together; the router plugin's required router version is satisfied.
- All four Vitest consumers use the same version. Node type definitions are aligned across
  desktop, core and CLI; the runtime remains Node 24 in development and CI.
- electron-vite moves from its beta to stable 6.0.0, which supports the existing Vite 8
  configuration, including `rollupOptions` ([release notes](https://github.com/alex8088/electron-vite/releases/tag/v6.0.0)).
- electron-builder uses the latest stable v26 release, 26.17.0, from its `v26` channel;
  npm's `latest` tag still points to 26.15.3 ([release notes](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.17.0)).
- Astro 7.4 requires Node 22.22 or newer, so the root development requirement and setup
  instructions are raised together. The published CLI runtime requirement is unchanged.
- Node 24.22.0 and all seven pinned GitHub Actions already match their latest releases.
- Newly resolved transitive dependencies also observe `minimumReleaseAge: 2880` minutes.
- No feature or API contract changes are intended. Dependabot PRs #13, #14 and #15 are
  replaced by the consolidated upgrade PR.

## Security fixes

The first audit found four indirect dependencies that direct upgrades alone did not fix:

| Dependency                                            | Previous | Resolved | Published (UTC)          |
| ----------------------------------------------------- | -------- | -------- | ------------------------ |
| http-cache-semantics                                  | 4.2.0    | 4.3.0    | 2026-10-04T02:56:05.593Z |
| source-map-js                                         | 1.2.1    | 1.2.2    | 2026-09-30T14:08:09.382Z |
| sharp                                                 | 0.35.4   | 0.35.5   | 2026-09-27T13:46:24.509Z |
| global-agent (optional Electron installer dependency) | 3.0.0    | 4.1.3    | 2026-03-11T16:29:05.224Z |

The first three updates satisfy their parents' existing ranges and only change the lockfile.
The scoped `@electron/get@3>global-agent` override removes the vulnerable `sprintf-js`
chain, for which no patched release is available. The downloader still uses the supported
`bootstrap()` interface, and a subprocess test verifies actual HTTP traffic through a local
proxy after initialization. The final `pnpm audit` reports no known vulnerabilities.

## Verification

- Frozen install, including release-age policy verification: passed.
- `pnpm peers`: no peer dependency issues.
- `pnpm check`: lint, formatting, type checks and all 1,863 tests passed (four existing
  platform-specific tests skipped).
- `pnpm build`: desktop, CLI and landing page builds passed.
- `pnpm audit`: no known vulnerabilities (992 resolved dependencies).
- CLI npm artifact built; version/help commands passed and its Node 22.13 requirement
  was checked independently of the root development requirement.
- Local macOS arm64 app bundle built with Electron 44.8.0 and electron-builder 26.17.0.

The full Playwright browser suite passed: 88 tests, including narrow-screen layout checks.
The packaged app passed `codesign --verify --deep --strict`, an in-memory SQLite query
inside its Electron runtime, and the packaged CLI version command.
Windows/Linux installers and a full native desktop UI walkthrough are not verified locally.
