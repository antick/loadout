import { existsSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Device, joinRemote, seedRemote } from "./backup-world";
import { tempDir } from "./helpers";

/** A process id no process has: the note of a run that crashed. */
const GONE_PID = 2 ** 22 + 7;
/** Long enough ago that no running git command still holds the file. */
const LEFT_BEHIND_SECONDS = 60;

/** Write `index.lock` as a git command cut off a while ago leaves it. */
function staleIndexLock(device: Device): void {
  const path = join(device.skillsDir, ".git", "index.lock");
  writeFileSync(path, "");
  const then = Date.now() / 1000 - LEFT_BEHIND_SECONDS;
  utimesSync(path, then, then);
}

describe("a backup merge that did not finish", () => {
  let temp: ReturnType<typeof tempDir>;
  const devices: Device[] = [];
  const track = <T extends Device>(device: T): T => {
    devices.push(device);
    return device;
  };

  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => {
    for (const device of devices.splice(0)) device.close();
    temp.cleanup();
  });

  /** B has A's new commit fetched and a merge of it half done, as a crash leaves it. */
  async function halfMerged(): Promise<Device> {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
    a.editSkill("alpha", "from A");
    await a.api.sync();
    b.git("fetch", "-q", "origin");
    b.git("merge", "--no-commit", "--no-ff", "origin/main");
    expect(existsSync(join(b.skillsDir, ".git", "MERGE_HEAD"))).toBe(true);
    return b;
  }

  it("is aborted and the sync goes on when it was Loadout's own", async () => {
    const b = await halfMerged();
    writeFileSync(join(b.skillsDir, ".git", "loadout-merging"), String(GONE_PID));
    staleIndexLock(b);

    await b.api.sync();
    expect(b.read("alpha")).toBe("from A");
    expect(existsSync(join(b.skillsDir, ".git", "MERGE_HEAD"))).toBe(false);
    expect(existsSync(join(b.skillsDir, ".git", "loadout-merging"))).toBe(false);
  });

  it("is left alone when someone else started it, or its process still runs", async () => {
    const b = await halfMerged();
    await expect(b.api.sync()).rejects.toMatchObject({
      code: "GIT",
      details: { marker: "MERGE_HEAD" },
    });
    writeFileSync(join(b.skillsDir, ".git", "loadout-merging"), String(process.ppid));
    await expect(b.api.sync()).rejects.toMatchObject({ code: "GIT" });
    expect(existsSync(join(b.skillsDir, ".git", "MERGE_HEAD"))).toBe(true);
  });

  it("waits for a git command that is still running, such as an editor's git view", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
    b.editSkill("alpha", "from B");
    const lock = join(b.skillsDir, ".git", "index.lock");
    writeFileSync(lock, "");
    setTimeout(() => rmSync(lock, { force: true }), 300);

    expect(await b.api.sync()).toMatchObject({ pushed: true });
  });

  it("stops on a lock someone else's git command left behind", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
    b.editSkill("alpha", "from B");
    staleIndexLock(b);

    await expect(b.api.sync()).rejects.toMatchObject({
      code: "GIT",
      details: { marker: "index.lock" },
    });
  });
});
