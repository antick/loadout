/**
 * Chromium picks a Linux keyring from XDG_CURRENT_DESKTOP and only knows the big desktops. On
 * Hyprland, Sway, niri, i3 and the like it falls back to `basic_text`, so credentials cannot be
 * saved even when a Secret Service (gnome-keyring, KeePassXC) is running. Returns the
 * `--password-store` value to ask for libsecret there, or null to keep Chromium's choice: on KDE
 * (KWallet), off Linux, or when the user already passed the switch.
 */
export function linuxPasswordStore(input: {
  platform: NodeJS.Platform;
  desktop: string | undefined;
  hasSwitch: boolean;
}): string | null {
  if (input.platform !== "linux" || input.hasSwitch) return null;
  const desktops = (input.desktop ?? "").toUpperCase().split(":");
  if (desktops.includes("KDE")) return null;
  return "gnome-libsecret";
}
