import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adoptAppData, removeOldAppData } from "./app-data";

let root: string;
let from: string;
let to: string;

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "loadout-app-data-"));
  from = join(root, "Application Support", "@loadout", "desktop");
  to = join(root, ".loadout", "app-dev");
  write(join(from, "secrets.json"), '{"token":"cipher"}');
  write(join(from, "window-state.json"), "{}");
  write(join(from, "Local Storage", "leveldb", "000003.log"), "prefs");
  write(join(from, "Cache", "data_0"), "cache");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("adoptAppData", () => {
  it("copies credentials, window state and web storage, not caches", () => {
    const move = adoptAppData(from, to);
    expect(move.copied.toSorted()).toEqual(["Local Storage", "secrets.json", "window-state.json"]);
    expect(readFileSync(join(to, "secrets.json"), "utf8")).toBe('{"token":"cipher"}');
    expect(existsSync(join(to, "Local Storage", "leveldb", "000003.log"))).toBe(true);
    expect(existsSync(join(to, "Cache"))).toBe(false);
  });

  it("never overwrites what the new folder already has", () => {
    write(join(to, "secrets.json"), '{"token":"newer"}');
    adoptAppData(from, to);
    expect(readFileSync(join(to, "secrets.json"), "utf8")).toBe('{"token":"newer"}');
  });

  it("does nothing without an old folder", () => {
    expect(adoptAppData(join(root, "missing"), to).copied).toEqual([]);
  });
});

describe("removeOldAppData", () => {
  it("removes the old folder and its empty scope folder once everything is across", () => {
    adoptAppData(from, to);
    expect(removeOldAppData(from, to)).toBe("removed");
    expect(existsSync(from)).toBe(false);
    expect(existsSync(join(root, "Application Support", "@loadout"))).toBe(false);
    expect(existsSync(join(root, "Application Support"))).toBe(true);
  });

  it("keeps it while something did not make it across", () => {
    expect(removeOldAppData(from, to)).toBe("kept_unsaved");
    expect(existsSync(join(from, "secrets.json"))).toBe(true);
  });

  it("keeps it while it still holds the library location file", () => {
    adoptAppData(from, to);
    write(join(from, "library.json"), "{}");
    expect(removeOldAppData(from, to)).toBe("kept_unsaved");
  });

  it("keeps it while another instance runs from it", () => {
    adoptAppData(from, to);
    symlinkSync("host.local-4242", join(from, "SingletonLock"));
    expect(removeOldAppData(from, to, (pid) => pid === 4242)).toBe("kept_in_use");
    expect(removeOldAppData(from, to, () => false)).toBe("removed");
  });
});
