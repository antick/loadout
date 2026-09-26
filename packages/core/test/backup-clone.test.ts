import {
  closeSync,
  existsSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { BACKUP_SKILL_LIMIT_BYTES } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tokenKey } from "../src/backup/credentials";
import { INTERNAL_KEYS } from "../src/settings/store";
import {
  type Device,
  createBareRemote,
  createDevice,
  isolateGit,
  joinRemote,
  memorySecrets,
  seedRemote,
} from "./backup-world";
import { makeSkill, tempDir, writeFile } from "./helpers";

/** A file that reports a large size without writing that much to disk. */
function sparseFile(path: string, bytes: number): void {
  const fd = openSync(path, "w");
  ftruncateSync(fd, bytes);
  closeSync(fd);
}

describe("backup clone, size rules and credentials", () => {
  let temp: ReturnType<typeof tempDir>;
  const devices: Device[] = [];
  const track = <T extends Device>(device: T): T => {
    devices.push(device);
    return device;
  };

  beforeEach(() => {
    temp = tempDir();
    isolateGit(temp.dir);
  });
  afterEach(() => {
    for (const device of devices.splice(0)) device.close();
    temp.cleanup();
  });

  it("a second device clone restores skills, tags and presets", async () => {
    const remote = createBareRemote(temp.dir);
    const a = track(createDevice(temp.dir, "A"));
    const alpha = a.addSkill("alpha", { tags: ["docs", "writing"] });
    const beta = a.addSkill("beta");
    const presetId = a.addPreset("Writing kit", [beta.id, alpha.id]);
    await a.api.init();
    await a.api.setRemote(remote);
    await a.api.sync();

    const b = track(await joinRemote(temp.dir, remote));

    expect(b.skill("alpha")).toMatchObject({ id: alpha.id, tags: ["docs", "writing"] });
    expect(b.skill("beta")?.id).toBe(beta.id);
    expect(b.skill("alpha")?.presetIds).toEqual([presetId]);
    const members = b.ctx.db.all<{ skill_id: string }>(
      "SELECT skill_id FROM preset_skills WHERE preset_id = ? ORDER BY sort_order",
      presetId,
    );
    expect(members.map((row) => row.skill_id)).toEqual([beta.id, alpha.id]);
    expect(await b.api.status()).toMatchObject({
      isRepo: true,
      branch: "main",
      upstreamHealth: "healthy",
      hasChanges: false,
    });
    expect(b.ctx.settings.getRaw(INTERNAL_KEYS.backupRemoteUrl, null)).toBe(remote);
    // No leftovers next to the library.
    expect(readdirSync(join(b.skillsDir, "..")).filter((n) => n.startsWith("skills."))).toEqual([]);
    await expect(b.api.clone(remote)).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
  });

  it("clone keeps skills that only exist on this device", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "shared"]);
    track(a);
    const b = track(createDevice(temp.dir, "B"));
    const mine = b.addSkill("mine", { body: "only on B" });
    const clash = b.addSkill("alpha", { body: "B's own alpha" });
    // Same name and same bytes as the backup: nothing to keep twice.
    b.addSkill("shared");

    await b.api.clone(remote);

    expect(b.skill("mine")?.id).toBe(mine.id);
    expect(b.read("mine", "SKILL.md")).toContain("only on B");
    // The backup's version owns the name; the local one moved aside and kept its identity.
    expect(b.skill("alpha")?.id).toBe(a.skill("alpha")?.id);
    expect(b.skill("alpha-local")?.id).toBe(clash.id);
    expect(b.read("alpha-local", "SKILL.md")).toContain("B's own alpha");
    expect(b.skill("shared")?.id).toBe(a.skill("shared")?.id);
    expect(existsSync(join(b.skillsDir, "shared-local"))).toBe(false);

    // The preserved skills are pushed with the next sync and reach the first device.
    const outcome = await b.api.sync();
    expect(outcome.pushed).toBe(true);
    await a.api.sync();
    expect(a.read("mine", "SKILL.md")).toContain("only on B");
    expect(a.skill("alpha-local")?.id).toBe(clash.id);
  });

  it("does not index a folder outside the library named by cloned metadata", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    // A skill folder that exists outside any library, and remote metadata pointing at it.
    const outside = makeSkill(join(temp.dir, "home-B"), "private-skill");
    const metadata = basename(a.ctx.paths.metadataDir);
    const evil = join(a.skillsDir, metadata, "skills", "evil.json");
    writeFile(
      evil,
      JSON.stringify({
        id: "evil",
        path: "../../private-skill",
        tags: [],
        source: { type: "import" },
        createdAt: 1,
      }),
    );
    a.git("add", "-A", "-f");
    a.git("-c", "user.name=x", "-c", "user.email=x@example.com", "commit", "-qm", "by hand");
    a.git("push", "-q", "origin", "main");

    const b = track(await joinRemote(temp.dir, remote));

    expect(b.store.list().map((skill) => skill.libraryPath)).toEqual([join(b.skillsDir, "alpha")]);
    expect(existsSync(join(b.skillsDir, metadata, "skills", "evil.json"))).toBe(false);
    expect(existsSync(join(outside, "SKILL.md"))).toBe(true);
  });

  it("clone of an empty remote leaves a usable repository", async () => {
    const remote = createBareRemote(temp.dir);
    const b = track(createDevice(temp.dir, "B"));
    b.addSkill("mine");
    await b.api.clone(remote);
    expect(b.skill("mine")).not.toBeNull();
    expect(await b.api.sync()).toMatchObject({ committed: true, pushed: true });
  });

  it("a failed clone leaves the library untouched", async () => {
    const b = track(createDevice(temp.dir, "B"));
    b.addSkill("mine");
    await expect(b.api.clone(join(temp.dir, "missing.git"))).rejects.toMatchObject({
      code: expect.stringMatching(/^GIT/),
    });
    expect(b.skill("mine")).not.toBeNull();
    expect(existsSync(join(b.skillsDir, "mine", "SKILL.md"))).toBe(true);
    expect(readdirSync(join(b.skillsDir, "..")).filter((n) => n.startsWith("skills."))).toEqual([]);
  });

  it("reclone sets the current library aside and keeps local work", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
    b.addSkill("unsynced");
    b.editSkill("alpha", "unsynced edit");

    await b.api.reclone(remote);

    const aside = readdirSync(join(b.skillsDir, "..")).filter((n) =>
      n.startsWith("skills.backup-"),
    );
    expect(aside).toHaveLength(1);
    expect(existsSync(join(b.skillsDir, "..", aside[0] ?? "", "alpha", "notes.md"))).toBe(true);
    expect(b.skill("unsynced")).not.toBeNull();
    expect(b.skill("alpha")?.id).toBe(a.skill("alpha")?.id);
    expect(existsSync(join(b.skillsDir, "alpha", "notes.md"))).toBe(false);
    expect(b.read("alpha-local")).toBe("unsynced edit");
    expect((await b.api.status()).upstreamHealth).toBe("healthy");
  });

  it("never runs a program named in the repository's own git config", async () => {
    const a = track(createDevice(temp.dir, "A"));
    a.addSkill("notes");
    await a.api.init();
    const marker = join(temp.dir, "fsmonitor-ran");
    a.git("config", "core.fsmonitor", `touch '${marker}'; false`);
    a.git("config", "core.hooksPath", join(temp.dir, "hooks"));
    mkdirSync(join(temp.dir, "hooks"));
    writeFileSync(join(temp.dir, "hooks", "pre-commit"), `#!/bin/sh\ntouch '${marker}'\n`, {
      mode: 0o755,
    });
    a.addSkill("more");
    await a.api.status();
    await a.api.sync();
    expect(existsSync(marker)).toBe(false);
  });

  it("never commits a half-written metadata file, only files named like one", async () => {
    const a = track(createDevice(temp.dir, "A"));
    a.addSkill("notes");
    const leftover = `schema.json.tmp.${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`;
    mkdirSync(a.ctx.paths.metadataDir, { recursive: true });
    writeFileSync(join(a.ctx.paths.metadataDir, leftover), "{}");
    writeFileSync(join(a.skillsDir, "notes", "draft.tmp.md"), "kept");
    await a.api.init();
    const tracked = a.git("ls-files");
    expect(tracked).not.toContain(leftover);
    expect(tracked).toContain("notes/draft.tmp.md");
  });

  it("keeps an oversized skill out of the backup through the managed ignore block", async () => {
    const a = track(createDevice(temp.dir, "A"));
    a.addSkill("small");
    const big = a.addSkill("big [v2]");
    sparseFile(join(a.skillsDir, "big [v2]", "model.bin"), BACKUP_SKILL_LIMIT_BYTES + 1);
    await a.api.init();

    const ignore = readFileSync(join(a.skillsDir, ".gitignore"), "utf8");
    expect(ignore).toContain(
      ".DS_Store\nThumbs.db\n__pycache__/\n*.pyc\n*.tmp.????????-????-????-????-????????????\n",
    );
    expect(ignore).toContain("/big\\ \\[v2\\]/\n");
    expect(ignore).toContain(`/${basename(a.ctx.paths.metadataDir)}/skills/${big.id}.json\n`);
    const tracked = a.git("ls-files");
    expect(tracked).toContain("small/SKILL.md");
    expect(tracked).not.toContain("big");
    expect(tracked).not.toContain(big.id);

    const report = await a.api.sizeReport();
    expect(report.oversized).toEqual([
      { name: "big [v2]", bytes: expect.any(Number), excluded: true },
    ]);
    expect(report.totalBytes).toBeGreaterThan(BACKUP_SKILL_LIMIT_BYTES);
    expect(report.skillLimitBytes).toBe(BACKUP_SKILL_LIMIT_BYTES);

    // Once it shrinks it comes back by itself, and the user's own ignore lines survive.
    sparseFile(join(a.skillsDir, "big [v2]", "model.bin"), 10);
    const withUserLine = `${readFileSync(join(a.skillsDir, ".gitignore"), "utf8")}secrets.txt\n`;
    writeFileSync(join(a.skillsDir, ".gitignore"), withUserLine);
    await a.api.sync();
    const after = readFileSync(join(a.skillsDir, ".gitignore"), "utf8");
    expect(after).toContain("secrets.txt");
    expect(after).not.toContain("big");
    expect(a.git("ls-files")).toContain("big [v2]/SKILL.md");
    expect((await a.api.sizeReport()).oversized).toEqual([]);

    // Growing again after git tracks it: a warning only. Untracking would delete it elsewhere.
    sparseFile(join(a.skillsDir, "big [v2]", "model.bin"), BACKUP_SKILL_LIMIT_BYTES + 1);
    await a.api.sync();
    expect((await a.api.sizeReport()).oversized).toEqual([
      { name: "big [v2]", bytes: expect.any(Number), excluded: false },
    ]);
    expect(readFileSync(join(a.skillsDir, ".gitignore"), "utf8")).not.toContain("big");
    expect(a.git("ls-files")).toContain("big [v2]/model.bin");
  });

  it("moves a token out of the remote URL and never writes it to git config", async () => {
    const a = track(createDevice(temp.dir, "A"));
    a.addSkill("alpha");
    await a.api.init();

    const clean = await a.api.setRemote(
      "https://pankaj:s3cr3t-t0ken@git.example.com/me/skills.git",
    );

    expect(clean).toBe("https://git.example.com/me/skills.git");
    expect(a.secrets.values.get(tokenKey("git.example.com"))).toBe("s3cr3t-t0ken");
    expect(a.ctx.settings.getRaw(INTERNAL_KEYS.backupRemoteUrl, "")).toBe(clean);
    const config = readFileSync(join(a.skillsDir, ".git", "config"), "utf8");
    expect(config).toContain("https://git.example.com/me/skills.git");
    expect(config).not.toContain("s3cr3t");
    expect((await a.api.status()).remoteUrl).toBe(clean);

    // Disconnecting forgets the remote and the token, and may be repeated.
    await a.api.removeRemote();
    await a.api.removeRemote();
    expect(a.secrets.values.size).toBe(0);
    expect(a.ctx.settings.getRaw(INTERNAL_KEYS.backupRemoteUrl, null)).toBeNull();
    expect((await a.api.status()).upstreamHealth).toBe("no_remote");
  });

  it("refuses a URL with a token when there is nowhere safe to keep it", async () => {
    const a = track(createDevice(temp.dir, "A", { secrets: memorySecrets(false) }));
    await a.api.init();
    await expect(
      a.api.setRemote("https://user:token@git.example.com/me/skills.git"),
    ).rejects.toMatchObject({ code: "CREDENTIALS_UNAVAILABLE" });
    expect(readFileSync(join(a.skillsDir, ".git", "config"), "utf8")).not.toContain("token");
    // Without a token the remote is simply used as it is (SSH keys, credential helpers).
    expect(await a.api.setRemote("git@git.example.com:me/skills.git")).toBe(
      "git@git.example.com:me/skills.git",
    );
  });

  it("remembers and sanitises the device name", async () => {
    const a = track(createDevice(temp.dir, "A"));
    expect(await a.api.deviceName()).toBe("Device A");
    expect(await a.api.setDeviceName("  Work\t<Laptop>\n ")).toBe("Work Laptop");
    expect(await a.api.deviceName()).toBe("Work Laptop");
    await expect(a.api.setDeviceName(" \n ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    a.ctx.settings.deleteRaw(INTERNAL_KEYS.backupDeviceName);
    expect((await a.api.deviceName()).length).toBeGreaterThan(0);
  });
});
