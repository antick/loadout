import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_SCHEMA_VERSION, SCHEMA_FILE } from "../src/skills/portable";
import {
  type Device,
  createBareRemote,
  createDevice,
  joinRemote,
  rawGit,
  useTempDevices,
} from "./backup-world";
import { writeFile } from "./helpers";

const HAND = ["-c", "user.name=Hand", "-c", "user.email=hand@example.com"];

function schemaOf(device: Device): { schemaVersion: number; appVersion: string } {
  return JSON.parse(readFileSync(join(device.ctx.paths.metadataDir, SCHEMA_FILE), "utf8"));
}

describe("backup compatibility between app versions", () => {
  const temp = useTempDevices();
  const { track } = temp;

  async function seed(appVersion: string): Promise<{ a: Device; remote: string }> {
    const remote = createBareRemote(temp.dir);
    const a = track(createDevice(temp.dir, "A", { appVersion }));
    a.addSkill("alpha");
    await a.api.init();
    await a.api.setRemote(remote);
    await a.api.sync();
    return { a, remote };
  }

  /** Push a commit by hand that says the backup uses a metadata format from the future. */
  function pushFutureFormat(a: Device, remote: string): void {
    const manual = join(temp.dir, "manual");
    rawGit(temp.dir, "clone", "-q", remote, manual);
    rawGit(manual, "checkout", "-q", "-B", "main", "origin/main");
    writeFile(
      join(manual, basename(a.ctx.paths.metadataDir), SCHEMA_FILE),
      JSON.stringify({ schemaVersion: BACKUP_SCHEMA_VERSION + 1, appVersion: "9.0.0" }),
    );
    writeFile(join(manual, "alpha", "notes.md"), "future");
    rawGit(manual, "add", "-A");
    rawGit(manual, ...HAND, "commit", "-qm", "future format");
    rawGit(manual, "push", "-q", "origin", "main");
  }

  it("records the highest app version and reminds older computers to update", async () => {
    const { a, remote } = await seed("1.0.0");
    expect(schemaOf(a)).toMatchObject({ appVersion: "1.0.0" });

    const b = track(await joinRemote(temp.dir, remote, "B", { appVersion: "1.2.0" }));
    b.addSkill("beta");
    await b.api.sync();
    expect(schemaOf(b).appVersion).toBe("1.2.0");
    expect((await b.api.status()).newerAppVersion).toBeNull();

    await a.api.fetch();
    expect((await a.api.status()).newerAppVersion).toBe("1.2.0");
    // A newer app version alone never blocks: the older computer still syncs.
    const outcome = await a.api.sync();
    expect(a.skill("beta")).not.toBeNull();
    expect(outcome.merge).not.toBeNull();
    // Writing from the older computer does not lower the recorded version.
    a.editSkill("alpha", "edited on A");
    await a.api.sync();
    expect(schemaOf(a).appVersion).toBe("1.2.0");
    expect((await a.api.status()).newerAppVersion).toBe("1.2.0");
  });

  it("refuses to merge a backup saved in a newer format and leaves everything as it was", async () => {
    const { a, remote } = await seed("1.0.0");
    pushFutureFormat(a, remote);
    const remoteHead = rawGit(remote, "rev-parse", "main");
    a.editSkill("alpha", "local work");

    await expect(a.api.sync()).rejects.toMatchObject({
      code: "BACKUP_TOO_NEW",
      message: expect.stringContaining("9.0.0"),
    });
    await expect(a.api.pull()).rejects.toMatchObject({ code: "BACKUP_TOO_NEW" });
    expect(a.read("alpha")).toBe("local work");
    expect(rawGit(remote, "rev-parse", "main")).toBe(remoteHead);
  });

  it("refuses to clone or restore a backup saved in a newer format", async () => {
    const { a, remote } = await seed("1.0.0");
    pushFutureFormat(a, remote);

    const c = track(createDevice(temp.dir, "C", { appVersion: "1.0.0" }));
    c.addSkill("gamma");
    await expect(c.api.clone(remote)).rejects.toMatchObject({ code: "BACKUP_TOO_NEW" });
    expect(existsSync(join(c.skillsDir, ".git"))).toBe(false);
    expect(c.skill("gamma")).not.toBeNull();

    // A newer app took this library to the future format; then the older one wrote over it.
    a.git("fetch", "-q", "origin");
    a.git("merge", "-q", "--ff-only", "origin/main");
    const future = a.git("rev-parse", "HEAD");
    writeFile(join(a.ctx.paths.metadataDir, SCHEMA_FILE), JSON.stringify({ schemaVersion: 1 }));
    rawGit(a.skillsDir, "add", "-A");
    rawGit(a.skillsDir, ...HAND, "commit", "-qm", "older app");
    const head = a.git("rev-parse", "HEAD");
    await expect(a.api.restore(future.slice(0, 12))).rejects.toMatchObject({
      code: "BACKUP_TOO_NEW",
    });
    expect(a.git("rev-parse", "HEAD")).toBe(head);
  });
});
