# Install Loadout

Loadout is a desktop app that manages AI agent skills across your coding tools.

Download it from the [latest release](https://github.com/antick/loadout-releases/releases/latest).
This page says which file to pick and what to click the first time you open it.

**Why the extra clicks?** Loadout is not signed with a paid Apple or Microsoft certificate yet.
macOS and Windows warn about any app that isn't, even a safe one. You only do this once: after
that, Loadout updates itself.

## macOS

**1. Pick the file.** Open the Apple menu → **About This Mac**.

- **Chip** says Apple M1, M2, M3 or later: download `Loadout-<version>-mac-arm64.dmg`
- **Processor** says Intel: download `Loadout-<version>-mac-x64.dmg`

**2. Install.** Open the `.dmg` and drag **Loadout** onto the **Applications** folder. Always run
it from Applications, not from the disk image or your Downloads folder. Otherwise it can't
update itself.

**3. Open it the first time.**

1. Open **Applications** and double-click **Loadout**. macOS says it can't check the app for
   malware and doesn't open it. Click **Done**.
2. Open **System Settings** → **Privacy & Security**.
3. Scroll down to **Security**. It says "Loadout" was blocked. Click **Open Anyway**.
4. Enter your password or use Touch ID, then click **Open Anyway** again.

From then on, Loadout opens like any other app.

<details>
<summary>Prefer the Terminal?</summary>

After step 2 above, run this once instead of the clicks in step 3:

```bash
xattr -dr com.apple.quarantine /Applications/Loadout.app
```

It removes the "downloaded from the internet" mark that makes macOS ask.

</details>

## Windows

**1. Download** `Loadout-Setup-<version>-x64.exe`.

**2. Run it.** Windows may show **Windows protected your PC**:

1. Click **More info**.
2. Click **Run anyway**.

Loadout installs for your user only, so it doesn't ask for an administrator password, and it
starts when the install finishes.

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
  from the [latest release](https://github.com/antick/loadout-releases/releases/latest) instead.
