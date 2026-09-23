import { isWslPath, wslDistroOf } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { usableMode } from "../src/deploy/engine";

describe("WSL paths", () => {
  it("recognises both spellings Windows uses for a distribution's files", () => {
    for (const path of [
      "\\\\wsl.localhost\\Ubuntu\\home\\me\\.claude\\skills",
      "\\\\wsl$\\Ubuntu-24.04\\home\\me\\.codex\\skills",
      "//wsl.localhost/Debian/home/me/.claude/skills",
      "  \\\\WSL$\\Ubuntu\\x  ",
    ]) {
      expect(isWslPath(path)).toBe(true);
    }
    expect(wslDistroOf("\\\\wsl.localhost\\Ubuntu\\home\\me")).toBe("Ubuntu");
    expect(wslDistroOf("\\\\wsl$\\Ubuntu-24.04\\home")).toBe("Ubuntu-24.04");
  });

  it("leaves every other path alone", () => {
    for (const path of [
      "C:\\Users\\me\\.claude\\skills",
      "\\\\server\\share\\skills",
      "\\\\wsl.localhost",
      "/home/me/.claude/skills",
      "/Users/me/wsl$/skills",
    ]) {
      expect(isWslPath(path)).toBe(false);
      expect(wslDistroOf(path)).toBeNull();
    }
  });

  it("deploys copies into WSL, whatever the deploy mode setting says", () => {
    const wsl = "\\\\wsl.localhost\\Ubuntu\\home\\me\\.claude\\skills\\pdf";
    expect(usableMode(wsl, "symlink")).toBe("copy");
    expect(usableMode(wsl, "copy")).toBe("copy");
    expect(usableMode("C:\\Users\\me\\.claude\\skills\\pdf", "symlink")).toBe("symlink");
    expect(usableMode("/home/me/.claude/skills/pdf", "symlink")).toBe("symlink");
  });
});
