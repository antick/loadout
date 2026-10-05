import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { uptime } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Device, joinRemote, seedRemote, useTempDevices } from "./backup-world";
import { writeFile } from "./helpers";

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
  const temp = useTempDevices();
  const { track } = temp;

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

  it("puts back a skill folder it had set aside, so the skill is never sent as deleted", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
    writeFile(join(b.skillsDir, "alpha", ".env"), "only here");
    a.editSkill("alpha", "from A");
    await a.api.sync();
    // As a crash leaves the skill-aware merge: our alpha set aside, A's version moved in.
    b.git("fetch", "-q", "origin");
    const head = b.git("rev-parse", "HEAD");
    b.git("merge", "--no-commit", "--no-ff", "-s", "ours", "origin/main");
    const stage = join(dirname(b.skillsDir), ".backup-stage-crashed");
    const ours = join(b.skillsDir, "alpha");
    const aside = join(stage, ".replaced", b.skill("alpha")?.id ?? "");
    const theirs = join(stage, "alpha");
    cpSync(join(a.skillsDir, "alpha"), theirs, { recursive: true });
    mkdirSync(dirname(aside), { recursive: true });
    renameSync(ours, aside);
    renameSync(theirs, ours);
    const journal = [
      { head, stage },
      { from: ours, to: aside },
      { from: theirs, to: ours },
    ].map((entry) => JSON.stringify(entry));
    writeFileSync(
      join(b.skillsDir, ".git", "loadout-merging"),
      [GONE_PID, ...journal, ""].join("\n"),
    );

    await b.api.sync();
    expect(b.read("alpha")).toBe("from A");
    expect(b.read("alpha", ".env")).toBe("only here");
    expect(existsSync(stage)).toBe(false);
    expect(b.git("log", "--diff-filter=D", "--name-only", "--format=")).not.toContain("alpha/");
    await a.api.sync();
    expect(a.skill("alpha")).not.toBeNull();
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

  it("is undone when written before this computer started, though its pid runs again", async () => {
    const b = await halfMerged();
    const note = join(b.skillsDir, ".git", "loadout-merging");
    writeFileSync(note, String(process.ppid));
    const beforeBoot = new Date(Date.now() - (uptime() + 60) * 1000);
    utimesSync(note, beforeBoot, beforeBoot);
    await b.api.sync();
    expect(existsSync(join(b.skillsDir, ".git", "MERGE_HEAD"))).toBe(false);
    expect(existsSync(note)).toBe(false);
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
