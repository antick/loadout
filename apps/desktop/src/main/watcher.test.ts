import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WATCH_DEBOUNCE_MS } from "./constants";
import { type FolderWatcher, watchFolders } from "./watcher";

/** Long enough for the OS to report the change and the debounce to run out. */
const SETTLE_MS = WATCH_DEBOUNCE_MS + 700;
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, SETTLE_MS));

describe("watchFolders", () => {
  let root: string;
  let watcher: FolderWatcher | null = null;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loadout-watch-"));
  });
  afterEach(() => {
    watcher?.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it("reports a change deep inside a watched folder once, after the quiet period", async () => {
    const skills = join(root, "repo", ".claude", "skills");
    mkdirSync(join(skills, "review"), { recursive: true });
    let changes = 0;
    watcher = watchFolders(
      () => [skills],
      () => {
        changes += 1;
      },
    );
    writeFileSync(join(skills, "review", "SKILL.md"), "one");
    writeFileSync(join(skills, "review", "notes.md"), "two");
    await settle();
    expect(changes).toBe(1);
  });

  it("skips folders that do not exist yet and ignores its own muted writes", async () => {
    const skills = join(root, "skills");
    mkdirSync(skills);
    let changes = 0;
    watcher = watchFolders(
      () => [skills, join(root, "missing")],
      () => {
        changes += 1;
      },
    );
    watcher.mute();
    writeFileSync(join(skills, "SKILL.md"), "mine");
    await settle();
    expect(changes).toBe(0);
  });
});
