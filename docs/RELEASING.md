# Release Loadout

The desktop package version is the source for installers, the update feed, standalone CLI,
and npm. Public macOS builds use Developer ID signing and Apple notarization. The workflow
creates a draft; publishing that draft makes the update available to installed apps.

## Development and installed copies

- `/Applications/Loadout.app` uses the existing `~/.loadout` library or its saved location.
- `pnpm dev` opens **Loadout Dev** with a DEV Dock badge and a visible development label.
  Its home is `~/.loadout-dev`, its library is `~/.loadout-dev/.loadout`, and its default
  agent folders live under that development home. It has separate settings, credentials,
  caches, process locks and logs. It never checks the public update feed or publishes a CLI
  launcher over the installed one.
- Existing development data in `~/.loadout` is preserved for the installed app. No automatic
  copying, deleting or moving of that library happens when starting the new development mode.
- This is data separation, not an operating-system sandbox. Explicitly adding a real project,
  selecting an external library, or overriding an agent path lets the development app modify
  that location. Use disposable project copies for testing. The repository CLI still operates
  on your real library unless you explicitly select a test library with `--library`.
- `pnpm package` uses the local packaging configuration. Its ad-hoc Mac builds are for local
  development, not public distribution. Public releases use `electron-builder.release.yml`.

## Apple and GitHub setup

Use a **Developer ID Application** certificate with its private key, exported as a
password-protected PKCS#12 (`.p12`) file. An Apple Development or Mac App Store certificate is
not interchangeable. Use an App Store Connect team API key with access to notarization.

The GitHub environment `release` permits tags matching `v*`. Keep the existing release-tag
protection enabled. Store these in that environment:

| Setting                      | Kind     | Content                                      |
| ---------------------------- | -------- | -------------------------------------------- |
| `APPLE_TEAM_ID`              | Variable | Developer team identifier                    |
| `MACOS_CERTIFICATE_P12`      | Secret   | Base64-encoded certificate and private key   |
| `MACOS_CERTIFICATE_PASSWORD` | Secret   | Password protecting the PKCS#12 file         |
| `APPLE_API_KEY_P8`           | Secret   | Contents of the notarization API private key |
| `APPLE_API_KEY_ID`           | Secret   | API key identifier                           |
| `APPLE_API_ISSUER`           | Secret   | API issuer identifier                        |

The workflow imports the certificate into a temporary keychain, grants codesign access,
and removes the keychain and API key in an `always()` cleanup step. PR builds do not receive
these credentials. The public packaging configuration refuses missing signing settings.
The checked-in `scripts/release/DeveloperIDG2CA.cer` is Apple's public
[Developer ID G2 intermediate certificate](https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer),
needed to validate the signing chain on a clean runner; it contains no private key.
Keep an encrypted backup of credentials outside GitHub; GitHub cannot export secret values.

The existing repository secret `UPDATE_FEED_SIGNING_KEY` is separate from Apple signing.
Retain it: released apps already trust its public half. Rotating it requires a staged key
migration while the old private key is still available.

## Build and publication gates

1. Confirm the version and what changes belong in the release. Commit the intended work.
2. Run `pnpm install --frozen-lockfile`, `pnpm check`, and the desktop UI tests. Fix failures.
3. Push the checked commit to `main`, then its matching `v<version>` tag. Keep published tags
   fixed. A failed release is corrected in a new version if the tag already points at bad code.
4. `Release builds` runs the full reusable CI workflow against the **tagged commit**, including
   macOS/Linux tests and UI tests, before it builds artifacts.
5. macOS builds sign and notarize the app, then validate both architectures' extracted ZIP
   apps and mounted DMGs. DMGs are signed, notarized and stapled separately. macOS standalone
   CLI binaries are signed and submitted to Apple; their checksums are generated afterwards.
   Bare CLI executables cannot carry a stapled ticket, so their first Gatekeeper assessment
   can require an internet connection.
   The standalone Node CLI uses its own entitlements, including executable-memory support
   required by Intel V8. Both Mac CLI binaries must start and report the release version.
6. The draft must contain both Mac DMG/ZIP pairs, Linux x64/arm64 AppImage and Debian packages,
   four standalone CLI executables, `SHA256SUMS`, `latest.json` and `latest.json.sig`. Windows
   remains unsupported. GitHub build provenance is attached to the release artifacts.
7. Before publication, download the candidate installers and run the acceptance checks below.
8. Publish with an authorized human/CLI credential (`gh release edit <tag> --draft=false --latest`).
   A release published using a workflow's default `GITHUB_TOKEN` does not trigger the downstream
   release-event workflows; use a human token or explicitly dispatch equivalent jobs.
9. Check `Publish the CLI to npm` and `Vercel production`. Verify npm reports the same
   version and the live website links to that release's installers. The Vercel workflow checks
   out the released tag and supplies `LOADOUT_RELEASE_TAG` to the build. Missing downloads
   fail deployment instead of silently publishing an old version or fallback links.

Homebrew remains optional and manual: its workflow requires a separately configured tap and
token. It is not a prerequisite for downloading, installing or updating the desktop app.

## Installer acceptance

- Check the app with `codesign --verify --deep --strict`, `spctl --assess --type execute`, and
  `xcrun stapler validate`. Validate the mounted DMG's app as well as the update ZIP's app.
- Download through a browser so macOS applies quarantine. Open the DMG, drag to Applications,
  eject it, and launch normally. No quarantine removal or Privacy & Security bypass is part
  of the supported installation procedure.
- Start Loadout Dev at the same time. Check distinct identities, windows, settings and library
  paths. Verify development cleanup affects only its own data.
- Exercise skill imports, project handling, credential storage and the bundled CLI. Run both
  processor architectures when hardware is available; report any architecture not launched.
- Exercise an installed older version updating to the candidate, including cancellation,
  restart, retained library/settings/credentials and the reported new version. Use a controlled
  acceptance feed or isolated test profile before publishing to the stable feed.
- Verify wrong publisher, invalid feed signature, damaged download, read-only destination,
  offline check and interrupted download all fail safely. Recheck signatures immediately
  before installation; never remove quarantine to make verification succeed.

## Recovery

Updates prepare a replacement on the installation disk before moving the old app aside. The
old copy stays next to the app as `Loadout.app.previous-<pid>` until the new version opens its
library and confirms the version. A failed launch leaves that copy available for manual
recovery; this is not an automatic rollback of database migrations.

If a release proves faulty, stop offering it as latest and publish a corrected **higher**
version. Already updated apps do not downgrade automatically. Back up the library before
manually restoring an older app; an older version may not understand a newer database.
Never replace files in a published release or move its tag.

## Local signing checks

For a signed local candidate, use the same Apple environment settings, a temporary keychain
(`CSC_KEYCHAIN`) and certificate qualifier (`CSC_NAME`, without `Developer ID Application:`).
`APPLE_API_KEY` points to a protected `.p8` file. Keep these values out of shell history.

```sh
pnpm exec turbo run build --filter=@loadout/desktop...
cd apps/desktop
pnpm exec electron-builder --config electron-builder.release.yml --mac --arm64 --x64 --publish never
```

From the repository root, `node scripts/release/macos.mjs verify` checks and notarizes the
DMGs as CI does. Supply `RUNNER_TEMP` as a disposable working directory. The `prepare` and
`cleanup` commands manage only their own signing subdirectory; `prepare` writes settings to
`GITHUB_ENV` for subsequent CI steps. Never print or commit the generated credentials.

References: [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
