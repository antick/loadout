import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_FILE_NAME } from "@loadout/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentRegistry } from "../src/agents";
import { createGitClient } from "../src/install/git-client";
import { createSkillsFileService } from "../src/skills-file/service";
import type * as fs from "../src/util/fs";
import { createRemovedStore } from "../src/storage";
import { type TestWorld, createTestWorld, makeSkill, passingSafety, writeFile } from "./helpers";
import { commitAll, initRepo, isolateTmpDir, redirectGithubTo } from "./install-fixtures";

/** Set to make the next folder replacement fail, as a full disk would. */
const failing = vi.hoisted(() => ({ replace: false }));
vi.mock("../src/util/fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    replaceDirAtomic: async (...args: Parameters<typeof actual.replaceDirAtomic>) => {
      if (failing.replace) throw new Error("disk full");
      return actual.replaceDirAtomic(...args);
    },
  };
});

let world: TestWorld;
let restores: (() => void)[];

beforeEach(() => {
  world = createTestWorld();
  restores = [];
  failing.replace = false;
});
afterEach(() => {
  for (const restore of restores) restore();
  world.cleanup();
});

it("puts a folder edited by hand back when its forced replacement fails", async () => {
  const remotes = join(world.root, "remotes");
  restores = [isolateTmpDir(join(world.root, "tmp")), redirectGithubTo(remotes)];
  const remote = initRepo(join(remotes, "acme", "skills.git"));
  makeSkill(join(remote, "skills"), "pdf", { files: { "run.sh": "echo one\n" } });
  commitAll(remote, "initial");
  const project = join(world.root, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, SKILLS_FILE_NAME),
    'agents = ["claude_code"]\n\n[[sources]]\nurl = "acme/skills"\nskills = ["pdf"]\n',
  );
  const { api } = createSkillsFileService(world.ctx, {
    git: createGitClient(world.ctx),
    registry: new AgentRegistry(world.ctx),
    store: world.store,
    removed: createRemovedStore(world.ctx, { store: world.store }),
    safety: passingSafety,
  });
  await api.apply(project);
  const notes = join(project, ".claude", "skills", "pdf", "notes.md");
  writeFile(notes, "mine\n");
  writeFile(join(remote, "skills", "pdf", "run.sh"), "echo two\n");
  commitAll(remote, "newer");

  failing.replace = true;
  await expect(api.apply(project, { update: true, force: true })).rejects.toThrow("disk full");

  expect(readFileSync(notes, "utf8")).toBe("mine\n");
});
