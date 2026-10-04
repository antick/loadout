import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ItemKind, itemRelativePath } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Device,
  createBareRemote,
  createDevice,
  joinRemote,
  seedRemote,
} from "./backup-world";
import { tempDir } from "./helpers";

/** Subagents, commands and rules sync one file at a time, beside the skills. */

function itemPath(device: Device, kind: ItemKind, name: string): string {
  return join(device.skillsDir, itemRelativePath(kind, name));
}

function writeItem(device: Device, kind: ItemKind, name: string, body: string): void {
  const path = itemPath(device, kind, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\ndescription: ${name}\n---\n${body}\n`);
}

function readItem(device: Device, kind: ItemKind, name: string): string | null {
  const path = itemPath(device, kind, name);
  return existsSync(path) ? (readFileSync(path, "utf8").split("---\n")[2]?.trim() ?? "") : null;
}

describe("backup sync of items", () => {
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

  it("merges items changed on different devices, file by file", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    writeItem(a, "subagent", "reviewer", "v1");
    writeItem(a, "command", "commit", "v1");
    await a.api.sync();
    const b = track(await joinRemote(temp.dir, remote));
    expect(readItem(b, "subagent", "reviewer")).toBe("v1");

    writeItem(a, "subagent", "reviewer", "from A");
    writeItem(a, "rule", "style", "new on A");
    writeItem(b, "command", "commit", "from B");
    writeItem(b, "command", "deploy", "new on B");
    a.editSkill("alpha", "skill from A");
    await a.api.sync();
    const outcome = await b.api.sync();

    expect(outcome.merge).toMatchObject({ upToDate: false, fastForward: false });
    expect(readItem(b, "subagent", "reviewer")).toBe("from A");
    expect(readItem(b, "rule", "style")).toBe("new on A");
    expect(readItem(b, "command", "commit")).toBe("from B");
    expect(readItem(b, "command", "deploy")).toBe("new on B");
    expect(b.read("alpha")).toBe("skill from A");

    await a.api.sync();
    expect(readItem(a, "command", "commit")).toBe("from B");
    expect(readItem(a, "command", "deploy")).toBe("new on B");
  });

  it("takes an item deleted on another device out here too", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    writeItem(a, "command", "commit", "v1");
    await a.api.sync();
    const b = track(await joinRemote(temp.dir, remote));

    rmSync(itemPath(a, "command", "commit"));
    await a.api.sync();
    b.editSkill("alpha", "keeps B busy");
    await b.api.sync();
    expect(readItem(b, "command", "commit")).toBeNull();
  });

  it("keeps items this device has when it connects to a backup with items", async () => {
    const remote = createBareRemote(temp.dir);
    const a = track(createDevice(temp.dir, "A"));
    a.addSkill("alpha");
    writeItem(a, "command", "shared", "from A");
    await a.api.init();
    await a.api.setRemote(remote);
    await a.api.sync();

    const b = track(createDevice(temp.dir, "B"));
    writeItem(b, "command", "shared", "from B");
    writeItem(b, "rule", "only-b", "mine");
    await b.api.clone(remote);

    expect(readItem(b, "command", "shared")).toBe("from A");
    expect(readItem(b, "command", "shared-local")).toBe("from B");
    expect(readItem(b, "rule", "only-b")).toBe("mine");
  });
});
