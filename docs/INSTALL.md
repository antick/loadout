# Install Loadout

Loadout is a desktop app that manages AI agent skills across your coding tools.

Download it from the [latest release](https://github.com/antick/loadout/releases/latest).
This page says which file to pick and what to click the first time you open it.

Loadout runs on macOS and Linux. Windows is not supported for now.

macOS releases from 0.4.1 are signed by Pankaj Sanam and notarized by Apple.

**Check a download (optional).** Every file in a release carries a signed record of the GitHub
build that made it. With the [GitHub CLI](https://cli.github.com) installed, run
`gh attestation verify <the file you downloaded> --repo antick/loadout`; it says whether the file
was built from this repository's release workflow.

## macOS

**1. Pick the file.** Open the Apple menu → **About This Mac**.

- **Chip** says Apple M1, M2, M3 or later: download `Loadout-<version>-mac-arm64.dmg`
- **Processor** says Intel: download `Loadout-<version>-mac-x64.dmg`

**2. Install.** Open the `.dmg` and drag **Loadout** onto the **Applications** folder. Always run
it from Applications, not from the disk image or your Downloads folder. Otherwise it can't
update itself.

**3. Open it the first time.** Open **Applications** and double-click **Loadout**. macOS may
ask whether you want to open an app downloaded from the internet; choose **Open**. You should
not need to disable security checks or remove quarantine. If macOS says the developer cannot
be verified or that the app is damaged, download the current signed installer again and report
that error if it persists.

Already using an older release? Its updater can install the first signed version. You can also
install the current DMG over the existing app after quitting it; your library is stored separately.

Developing Loadout too? `pnpm dev` opens **Loadout Dev**, with a separate library and settings.
Both apps can stay open together. See [development separation](RELEASING.md#development-and-installed-copies).

## Linux

Pick the file that matches your processor. Run `uname -m` if you're not sure: `x86_64` means x64,
`aarch64` means arm64.

**AppImage (any distribution, updates itself):**

1. Download `Loadout-<version>-x86_64.AppImage` or `Loadout-<version>-arm64.AppImage` into a
   folder you own, such as `~/Applications`.
2. Make it executable and start it:

   ```bash
   chmod +x ~/Applications/Loadout-*.AppImage
   ~/Applications/Loadout-*.AppImage
   ```

If it doesn't start and mentions FUSE, install it first. On Ubuntu 24.04 and later:

```bash
sudo apt install libfuse2t64
```

On Ubuntu 22.04 and Debian: `sudo apt install libfuse2`.

**Debian or Ubuntu package:**

```bash
sudo apt install ./loadout_<version>_amd64.deb
```

Use `arm64` instead of `amd64` on arm64. When there is an update, Loadout downloads the new
package and opens it in your software installer. Click **Install** there.

## Updates

Loadout checks for a new version when it starts and every six hours after that. When it finds
one:

1. Click **Update** in the message that appears, or go to **Settings → About → Download update**.
2. When the download finishes, click **Restart now**.

Loadout closes, replaces itself and opens again. You don't need to repeat any of the steps
above. Every download is checked against the checksum published with the release before
anything is installed.

To check by hand: **Settings → About → Check for updates**.

Loadout can't update itself in these cases, and says so in Settings → About:

- **macOS:** it's running from the disk image or the Downloads folder. Move it to Applications
  and open it from there.
- **Any system:** your user can't change the folder it's installed in. Download the new version
  from the [latest release](https://github.com/antick/loadout/releases/latest) instead.
