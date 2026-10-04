import { describe, expect, it } from "vitest";
import { createEditorOpener, describeEditors, locateEditors } from "./editors";

const HOME = "/Users/me";

function detect(platform: NodeJS.Platform, present: string[], env = {}) {
  const set = new Set(present);
  return { platform, homeDir: HOME, env, exists: (path: string) => set.has(path) };
}

describe("locating editors", () => {
  it("prefers the macOS app bundle and falls back to the command", () => {
    const located = locateEditors(
      detect("darwin", ["/Applications/Cursor.app", "/opt/homebrew/bin/zed"], {
        PATH: "/usr/bin",
      }),
    );
    expect(located.get("cursor")).toEqual({
      command: "open",
      args: ["-a", "/Applications/Cursor.app"],
    });
    expect(located.get("zed")).toEqual({ command: "/opt/homebrew/bin/zed", args: [] });
    expect(located.has("vscode")).toBe(false);
  });

  it("looks in the user's own Applications folder and on PATH", () => {
    const located = locateEditors(
      detect("darwin", [`${HOME}/Applications/Zed.app`, "/custom/bin/code"], {
        PATH: "/custom/bin:/usr/bin",
      }),
    );
    expect(located.get("zed")?.args).toEqual(["-a", `${HOME}/Applications/Zed.app`]);
    expect(located.get("vscode")?.command).toBe("/custom/bin/code");
  });

  it("on Windows looks under the local programs and Program Files folders", () => {
    const located = locateEditors(
      detect(
        "win32",
        [
          "C:\\Users\\me\\AppData\\Local\\Programs\\cursor\\Cursor.exe",
          "C:\\Program Files\\Sublime Text\\sublime_text.exe",
        ],
        { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local", ProgramFiles: "C:\\Program Files" },
      ),
    );
    expect([...located.keys()]).toEqual(["cursor", "sublime"]);
    expect(located.get("cursor")?.args).toEqual([]);
  });

  it("lists what was found in a fixed order with display names", () => {
    const located = locateEditors(
      detect("linux", ["/usr/bin/subl", "/usr/bin/code"], { PATH: "/usr/bin" }),
    );
    expect(describeEditors(located)).toEqual([
      { id: "vscode", name: "Visual Studio Code" },
      { id: "sublime", name: "Sublime Text" },
    ]);
  });
});

describe("the editor opener", () => {
  it("opens the system default through the shell and reports its failure", async () => {
    const opened: string[] = [];
    const opener = createEditorOpener({
      detect: () => detect("linux", []),
      openPath: async (path) => {
        opened.push(path);
        return path.endsWith("gone.md") ? "No such file" : "";
      },
      reveal: async () => {},
      isFile: (path) => (path.endsWith("gone.md") ? null : true),
    });
    await opener.open("system", "/skills/pdf/SKILL.md");
    expect(opened).toEqual(["/skills/pdf/SKILL.md"]);
    await expect(opener.open("system", "/skills/gone.md")).rejects.toThrow("No such file");
    await expect(opener.open("cursor", "/skills/pdf")).rejects.toThrow("Cursor was not found");
  });

  it("shows scripts, programs and folders in the file manager instead of running them", async () => {
    const opened: string[] = [];
    const revealed: string[] = [];
    const folders = new Set(["/skills/pdf", "/skills/notes.md"]);
    const opener = createEditorOpener({
      detect: () => detect("win32", []),
      openPath: async (path) => {
        opened.push(path);
        return "";
      },
      reveal: async (path) => {
        revealed.push(path);
      },
      isFile: (path) => !folders.has(path),
    });
    for (const path of [
      "/skills/pdf/scripts/run.command",
      "/skills/pdf/scripts/setup.bat",
      "/skills/pdf/tool.exe",
      "/skills/pdf/scripts/fill.js",
      "/skills/pdf",
      "/skills/notes.md",
    ]) {
      await opener.open("system", path);
    }
    await opener.open("system", "/skills/pdf/REFERENCE.MD");
    expect(revealed).toEqual([
      "/skills/pdf/scripts/run.command",
      "/skills/pdf/scripts/setup.bat",
      "/skills/pdf/tool.exe",
      "/skills/pdf/scripts/fill.js",
      "/skills/pdf",
      "/skills/notes.md",
    ]);
    expect(opened).toEqual(["/skills/pdf/REFERENCE.MD"]);
  });

  it("detects once and again only after a while", () => {
    let detections = 0;
    let time = 0;
    const opener = createEditorOpener({
      detect: () => {
        detections += 1;
        return detect("linux", ["/usr/bin/code"], { PATH: "/usr/bin" });
      },
      openPath: async () => "",
      reveal: async () => {},
      now: () => time,
    });
    expect(opener.editors()).toEqual([{ id: "vscode", name: "Visual Studio Code" }]);
    opener.editors();
    expect(detections).toBe(1);
    time = 10 * 60 * 1000;
    opener.editors();
    expect(detections).toBe(2);
  });
});
