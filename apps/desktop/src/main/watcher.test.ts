import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WATCH_DEBOUNCE_MS } from "./constants";
import { type FolderWatcher, watchFolders } from "./watcher";

/**
 * File events are slow when the machine is busy, and macOS drops those made before its event
 * stream is running, so the test writes again until the watcher reports or time runs out. Each
 * retry waits out the quiet period: a write inside it only restarts the wait.
 */
const WAIT_LIMIT_MS = 12_000;
const RETRY_MS = WATCH_DEBOUNCE_MS * 3;

async function writeUntil(file: string, noticed: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  for (let round = 0; !noticed() && Date.now() < deadline; round += 1) {
    writeFileSync(file, `edit ${round}`);
    await new Promise((done) => setTimeout(done, RETRY_MS));
  }
}

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

  it(
    "reports a change deep inside a watched folder, skipping folders that do not exist",
    async () => {
      const skills = join(root, "repo", ".claude", "skills");
      mkdirSync(join(skills, "review"), { recursive: true });
      let changes = 0;
      watcher = watchFolders(
        () => [skills, join(root, "missing")],
        () => {
          changes += 1;
        },
      );
      await writeUntil(join(skills, "review", "SKILL.md"), () => changes > 0);
      expect(changes).toBeGreaterThan(0);
    },
    WAIT_LIMIT_MS + RETRY_MS * 4,
  );
});
