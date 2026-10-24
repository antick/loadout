import { describe, expect, it } from "vitest";
import { linuxPasswordStore } from "./password-store";

describe("linuxPasswordStore", () => {
  it("asks for libsecret on desktops Chromium does not know", () => {
    for (const desktop of ["Hyprland", "sway", "niri", "i3", undefined]) {
      expect(linuxPasswordStore({ platform: "linux", desktop, hasSwitch: false })).toBe(
        "gnome-libsecret",
      );
    }
  });

  it("leaves KDE on KWallet", () => {
    expect(linuxPasswordStore({ platform: "linux", desktop: "KDE", hasSwitch: false })).toBeNull();
    expect(
      linuxPasswordStore({ platform: "linux", desktop: "plasma:KDE", hasSwitch: false }),
    ).toBeNull();
  });

  it("keeps a switch the user passed", () => {
    expect(
      linuxPasswordStore({ platform: "linux", desktop: "Hyprland", hasSwitch: true }),
    ).toBeNull();
  });

  it("does nothing off Linux", () => {
    expect(
      linuxPasswordStore({ platform: "darwin", desktop: undefined, hasSwitch: false }),
    ).toBeNull();
  });
});
