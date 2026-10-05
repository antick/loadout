import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Skill, planInstallNames } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RemovedStore, createRemovedStore } from "../src/storage";
import { type TestWorld, createTestWorld, makeSkill } from "./helpers";
import {
  type InstallHarness,
  commitAll,
  createInstallHarness,
  initRepo,
  isolateTmpDir,
  leftoverCheckouts,
  redirectGithubTo,
  skillsDirOf,
} from "./install-fixtures";

let world: TestWorld;
let install: InstallHarness;
let removed: RemovedStore;
let refreshed: string[];
let tmp: string;
let remote: string;
let restores: (() => void)[];

beforeEach(() => {
  world = createTestWorld();
  tmp = join(world.root, "tmp");
  const remotes = join(world.root, "remotes");
  restores = [isolateTmpDir(tmp), redirectGithubTo(remotes)];
  removed = createRemovedStore(world.ctx, { store: world.store });
  refreshed = [];
  install = createInstallHarness(world, {
    replace: {
      removed,
      refreshCopies: async (skill: Skill) => {
        refreshed.push(skill.name);
      },
    },
  });
  remote = initRepo(join(remotes, "acme", "skills.git"));
  makeSkill(join(remote, "skills"), "pdf", { files: { "scripts/run.sh": "echo acme" } });
  makeSkill(join(remote, "skills"), "docx");
  commitAll(remote, "initial");
});

afterEach(() => {
  for (const restore of restores) restore();
  world.cleanup();
});

/** A `pdf` of the user's own, installed from a folder on this computer. */
async function installOwnPdf(): Promise<Skill> {
  const own = makeSkill(join(world.root, "own"), "pdf", { body: "My own pdf skill" });
  return install.api.fromPath(own);
}

describe("replacing the library skill that holds a name", () => {
  it("puts the new skill in the old one's place and keeps the old version", async () => {
    const own = await installOwnPdf();
    world.store.setTags(own.id, ["docs"]);
    const preview = await install.api.previewGit(remote);

    const rows = preview.skills.map((skill) => skill.name);
    expect(planInstallNames(rows, preview.library).map((o) => o.kind)).toEqual(["new", "taken"]);
    expect(
      planInstallNames(rows, preview.library, undefined, [true, true]).map((o) => o.kind),
    ).toEqual(["new", "replaces"]);

    const [pdf] = await install.api.confirmGit(preview.previewId, [
      { relPath: "skills/pdf", name: "pdf", replace: true },
    ]);

    expect(pdf).toMatchObject({ id: own.id, name: "pdf", dirName: "pdf", sourceType: "git" });
    expect(world.store.list().map((skill) => skill.name)).toEqual(["pdf"]);
    expect(world.store.get(own.id).tags).toEqual(["docs"]);
    expect(readFileSync(join(skillsDirOf(world), "pdf", "scripts/run.sh"), "utf8")).toBe(
      "echo acme",
    );
    const [kept] = removed.list();
    expect(kept).toMatchObject({ name: "pdf", reason: "replaced" });
    expect(readFileSync(join(removed.contentPath(kept?.id ?? ""), "SKILL.md"), "utf8")).toContain(
      "My own pdf skill",
    );
    expect(refreshed).toEqual(["pdf"]);
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });

  it("installs as usual when the name is free, and without replace adds a numbered copy", async () => {
    await installOwnPdf();
    const preview = await install.api.previewGit(remote);
    const installed = await install.api.confirmGit(preview.previewId, [
      { relPath: "skills/docx", name: "docx", replace: true },
      { relPath: "skills/pdf", name: "pdf" },
    ]);

    expect(installed.map((skill) => skill.name)).toEqual(["docx", "pdf-2"]);
    expect(removed.list()).toEqual([]);
    expect(existsSync(join(skillsDirOf(world), "pdf", "scripts"))).toBe(false);
  });

  it("keeps nothing aside when the incoming skill is identical", async () => {
    const preview = await install.api.previewGit(remote);
    const [first] = await install.api.confirmGit(preview.previewId, [
      { relPath: "skills/pdf", name: "pdf" },
    ]);
    const again = await install.api.previewGit(remote);
    const [second] = await install.api.confirmGit(again.previewId, [
      { relPath: "skills/pdf", name: "pdf", replace: true },
    ]);

    expect(second?.id).toBe(first?.id);
    expect(removed.list()).toEqual([]);
  });
});
