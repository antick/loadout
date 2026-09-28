import { join } from "node:path";
import type { SkillSource } from "@loadout/shared";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let box: Sandbox;
beforeEach(() => {
  box = createSandbox();
});
afterEach(() => box.cleanup());

it("lists sources with their skills and leaves loose folders out", async () => {
  await box.cli("skills", "install", writeSkill(box.root, "loose"));
  const empty = await box.cli("sources", "list");
  expect(empty.stdout).toContain("No sources yet");
  expect(empty.stdout).toContain("1 skill made here or imported from a folder not listed.");

  const maker = createSandbox();
  try {
    for (const name of ["alpha", "beta"]) {
      await maker.cli("skills", "install", writeSkill(maker.root, name));
    }
    const zip = join(maker.root, "pack.zip");
    await maker.cli("skills", "export", "--all", "--out", zip);
    await box.cli("skills", "install", zip, "--all");
    const sources = (await box.cli("sources", "list", "--json")).json<
      (SkillSource & { skills: string[] })[]
    >();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: "archive",
      label: "pack.zip",
      skills: ["alpha", "beta"],
    });
  } finally {
    maker.cleanup();
  }
});
