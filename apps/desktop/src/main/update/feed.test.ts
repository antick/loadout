import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// The release workflow's feed builder: what it writes must be what the app accepts.
import { buildFeed, targetForFile } from "../../../scripts/update-feed.mjs";
import { parseUpdateFeed, updateTargetFor } from "./feed";

const FEED_URL = "https://github.com/owner/releases/releases/latest/download/latest.json";
const SHA = "a".repeat(64);

function file(url: string) {
  return { name: "Loadout-1.0.0-mac-arm64.zip", url, sha256: SHA, size: 10 };
}

describe("updateTargetFor", () => {
  it("names the build for each system", () => {
    expect(updateTargetFor("darwin", "arm64", false)).toBe("darwin-arm64");
    expect(updateTargetFor("win32", "x64", false)).toBe("win32-x64");
    expect(updateTargetFor("linux", "x64", true)).toBe("linux-x64-appimage");
    expect(updateTargetFor("linux", "arm64", false)).toBe("linux-arm64-deb");
    expect(updateTargetFor("linux", "ia32", false)).toBeNull();
    expect(updateTargetFor("freebsd", "x64", false)).toBeNull();
  });
});

describe("parseUpdateFeed", () => {
  it("keeps valid files from the feed's own site", () => {
    const feed = parseUpdateFeed(
      {
        version: "1.0.0",
        releaseUrl: "https://github.com/owner/releases/releases/tag/v1.0.0",
        files: {
          "darwin-arm64": file("https://github.com/owner/releases/releases/download/v1.0.0/a.zip"),
        },
      },
      FEED_URL,
    );
    expect(feed.version).toBe("1.0.0");
    expect(feed.files["darwin-arm64"]?.sha256).toBe(SHA);
  });

  it("drops files that point at another site, use plain HTTP, or lack a checksum", () => {
    const feed = parseUpdateFeed(
      {
        version: "1.0.0",
        files: {
          "darwin-arm64": file("https://evil.example/a.zip"),
          "darwin-x64": file("http://github.com/a.zip"),
          "win32-x64": { ...file("https://github.com/a.exe"), sha256: "short" },
        },
      },
      FEED_URL,
    );
    expect(feed.files).toEqual({});
  });

  it("accepts plain HTTP only for a feed on this computer", () => {
    const local = "http://127.0.0.1:8080/latest.json";
    const feed = parseUpdateFeed(
      { version: "1.0.0", files: { "darwin-arm64": file("http://127.0.0.1:8080/a.zip") } },
      local,
    );
    expect(feed.files["darwin-arm64"]).toBeDefined();
  });

  it("refuses a feed without a proper version", () => {
    expect(() => parseUpdateFeed({ version: "latest" }, FEED_URL)).toThrow(/version/);
    expect(() => parseUpdateFeed([], FEED_URL)).toThrow(/version/);
  });
});

describe("update-feed.mjs", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("maps every installer name electron-builder writes", () => {
    expect(targetForFile("Loadout-1.2.0-mac-arm64.zip")).toBe("darwin-arm64");
    expect(targetForFile("Loadout-1.2.0-mac-x64.zip")).toBe("darwin-x64");
    expect(targetForFile("Loadout-1.2.0-mac-arm64.dmg")).toBeNull();
    expect(targetForFile("Loadout-Setup-1.2.0-x64.exe")).toBe("win32-x64");
    expect(targetForFile("Loadout-1.2.0-x86_64.AppImage")).toBe("linux-x64-appimage");
    expect(targetForFile("Loadout-1.2.0-arm64.AppImage")).toBe("linux-arm64-appimage");
    expect(targetForFile("loadout_1.2.0_amd64.deb")).toBe("linux-x64-deb");
    expect(targetForFile("loadout_1.2.0_arm64.deb")).toBe("linux-arm64-deb");
    expect(targetForFile("SHA256SUMS")).toBeNull();
  });

  it("writes a feed the app accepts", async () => {
    dir = mkdtempSync(join(tmpdir(), "loadout-feed-"));
    writeFileSync(join(dir, "Loadout-1.2.0-mac-arm64.zip"), "zip bytes");
    writeFileSync(join(dir, "Loadout-Setup-1.2.0-x64.exe"), "exe bytes");
    const raw = await buildFeed({ dir, version: "1.2.0", repo: "owner/releases" });
    const feed = parseUpdateFeed(JSON.parse(JSON.stringify(raw)), FEED_URL);
    expect(feed.releaseUrl).toBe("https://github.com/owner/releases/releases/tag/v1.2.0");
    expect(Object.keys(feed.files).sort()).toEqual(["darwin-arm64", "win32-x64"]);
    expect(feed.files["win32-x64"]).toMatchObject({
      url: "https://github.com/owner/releases/releases/download/v1.2.0/Loadout-Setup-1.2.0-x64.exe",
      size: 9,
    });
  });
});
