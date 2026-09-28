import { join } from "node:path";
import type { Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScanService } from "../src/scan/service";
import { type EditorWorld, createEditorWorld, rejection } from "./editor-world";
import { makeSkill } from "./helpers";

let setup: EditorWorld;

beforeEach(() => {
  setup = createEditorWorld();
});
afterEach(() => setup.world.restore());

describe("marking a skill as the user's own", () => {
  it("marks and unmarks a skill without a source, leaving its last change alone", async () => {
    const skill = setup.world.addSkill("mine");
    const marked = await setup.skills.api.setAuthored(skill.id, true);
    expect(marked).toMatchObject({ authored: true, updatedAt: skill.updatedAt });
    expect((await setup.skills.api.setAuthored(skill.id, false)).authored).toBe(false);
  });

  it("refuses a skill that follows a source", async () => {
    const pdf = await setup.world.installFromGit("pdf");
    const error = await rejection(setup.skills.api.setAuthored(pdf.id, true));
    expect(error.code).toBe("INVALID_INPUT");
    expect(setup.world.store.get(pdf.id).authored).toBe(false);
  });

  it("travels with the backup metadata", async () => {
    const skill = setup.world.addSkill("mine");
    await setup.skills.api.setAuthored(skill.id, true);
    const { portable } = setup.world;
    portable.write();
    setup.world.store.update(skill.id, { authored: false });
    portable.rebuild({ authoritative: true });
    expect(setup.world.store.get(skill.id).authored).toBe(true);
  });

  it("clears the mark when the skill is linked to a source", async () => {
    const pdf = await setup.world.installFromGit("pdf");
    const detached = await setup.world.updates.api.detach(pdf.id);
    await setup.skills.api.setAuthored(detached.id, true);
    const candidate = await setup.world.updates.api.lookUpSource(
      pdf.id,
      "https://github.com/acme/skills",
    );
    const linked = await setup.world.updates.api.attachSource(pdf.id, candidate);
    expect(linked).toMatchObject({ authored: false, sourceType: "git" });
  });
});

describe("import hook", () => {
  it("tells about each imported skill and the folder it came from", async () => {
    const { world } = setup;
    world.installAgents(".claude");
    const folder = makeSkill(join(world.home, ".claude", "skills"), "found");
    const onImported = vi.fn<(skill: Skill, sourcePath: string) => void>();
    const scan = createScanService(world.ctx, {
      store: world.store,
      registry: world.registry,
      install: world.install.installIntoLibrary,
      onImported,
    });
    const skill = await scan.importDiscovered(folder);
    expect(onImported).toHaveBeenCalledWith(skill, folder);
  });
});
