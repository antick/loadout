import { describe, expect, it } from "vitest";
import { type LocateInput, locateApp } from "./locate";

const MAC_EXEC = "/Applications/Loadout.app/Contents/MacOS/Loadout";

function locate(input: Partial<LocateInput>, writable = true) {
  return locateApp({
    platform: "darwin",
    execPath: MAC_EXEC,
    appImage: undefined,
    packaged: true,
    writable: () => writable,
    ...input,
  });
}

describe("locateApp", () => {
  it("replaces the macOS app bundle in place", () => {
    expect(locate({})).toEqual({
      method: "replace",
      target: "/Applications/Loadout.app",
      blocker: null,
    });
  });

  it("explains why a macOS copy cannot replace itself", () => {
    expect(locate({ packaged: false }).blocker).toBe("development");
    expect(
      locate({
        execPath:
          "/private/var/folders/x/AppTranslocation/ABC/d/Loadout.app/Contents/MacOS/Loadout",
      }).blocker,
    ).toBe("translocated");
    expect(
      locate({ execPath: "/Volumes/Loadout 1.0.0/Loadout.app/Contents/MacOS/Loadout" }, false)
        .blocker,
    ).toBe("disk_image");
    expect(locate({}, false).blocker).toBe("read_only");
  });

  it("runs the installer on Windows", () => {
    expect(locate({ platform: "win32", execPath: "C:\\\\Loadout\\\\Loadout.exe" })).toEqual({
      method: "installer",
      target: null,
      blocker: null,
    });
  });

  it("replaces an AppImage, and hands a .deb install to the system installer", () => {
    const appImage = locate({
      platform: "linux",
      execPath: "/tmp/.mount/loadout",
      appImage: "/home/me/Loadout.AppImage",
    });
    expect(appImage).toEqual({
      method: "replace",
      target: "/home/me/Loadout.AppImage",
      blocker: null,
    });
    expect(
      locate({ platform: "linux", execPath: "/tmp/x", appImage: "/opt/Loadout.AppImage" }, false)
        .blocker,
    ).toBe("read_only");
    expect(locate({ platform: "linux", execPath: "/opt/Loadout/loadout" }).method).toBe("package");
  });
});
