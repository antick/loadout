import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileHistory } from "../src/editor";
import { PresetStore } from "../src/presets/store";
import { type SkillsService, createSkillsService } from "../src/skills/service";
import { createGitClient } from "../src/install/git-client";
import { type StorageService, createStorageService } from "../src/storage";
import { makeSkill } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld, rejection, skillText } from "./workspace-world";
import { createRequest } from "../src/install/download";
import { createClawhubClient } from "../src/market/clawhub";
import { createPublishService } from "../src/publish";

describe("deleting a library skill", () => {
  let world: WorkspaceWorld;
  let skills: SkillsService;
  let storage: StorageService;
  let claude: string;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude");
    claude = join(world.home, ".claude", "skills");
    skills = createSkillsService(world.ctx, {
      store: world.store,
      removeDeployments: world.deploy.removeAllForSkill,
      history: createFileHistory(world.ctx.paths.historyDir),
      install: () => Promise.reject(new Error("not used here")),
      rename: { deploy: world.deploy, projectSkillFolders: () => [] },
      removed: world.removed,
    });
    storage = createStorageService(world.ctx, {
      deploy: world.deploy,
      store: world.store,
      git: createGitClient(world.ctx),
      removed: world.removed,
      publish: createPublishService(world.ctx, {
        store: world.store,
        clawhub: createClawhubClient(createRequest()),
      }),
    });
  });
  afterEach(() => world.cleanup());

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "keeps the skill when its copy in an agent cannot be removed",
    async () => {
      world.ctx.settings.set("deployMode", "copy");
      const skill = world.addSkill("notes");
      await world.deploy.api.deploy(skill.id, "claude_code");
      chmodSync(claude, 0o555);
      let result;
      try {
        result = await skills.api.removeMany([skill.id]);
      } finally {
        chmodSync(claude, 0o755);
      }
      expect(result).toMatchObject({ succeeded: 0, removedIds: [] });
      expect(result.failed).toHaveLength(1);
      // The skill and the row proving the copy is ours both stay, so a retry can clean up.
      expect(world.store.find(skill.id)).not.toBeNull();
      expect(world.store.deployment(skill.id, "claude_code")).not.toBeNull();
      expect(existsSync(skill.libraryPath)).toBe(true);

      expect(await skills.api.removeMany([skill.id])).toMatchObject({ succeeded: 1 });
      expect(existsSync(join(claude, "notes"))).toBe(false);
    },
  );

  it("dry run: counts and refuses as the real run would, and changes nothing", async () => {
    const skill = world.addSkill("notes");
    await world.deploy.api.deploy(skill.id, "claude_code");
    const result = await skills.api.removeMany([skill.id, "no-such-id"], { dryRun: true });
    expect(result).toMatchObject({ succeeded: 1, removedIds: [] });
    expect(result.failed).toEqual([expect.objectContaining({ name: "no-such-id" })]);
    expect(existsSync(skill.libraryPath)).toBe(true);
    expect(existsSync(join(claude, "notes"))).toBe(true);
    expect(await storage.api.removed()).toEqual([]);
  });

  it("keeps it in Recently removed and brings back the same skill with tags and presets", async () => {
    const skill = world.addSkill("notes", { "ref.md": "reference" });
    world.store.update(skill.id, {
      sourceRef: "/src/notes",
      sourceRevision: "abc",
      sourceTrustedHost: "cdn.example.com",
      suggestFor: ["*.md"],
      blockedAgents: ["codex"],
    });
    world.store.setTags(skill.id, ["writing", "daily"]);
    const presets = new PresetStore(world.ctx.db);
    const preset = presets.insert({ name: "Work", description: null, icon: null });
    presets.addSkills(preset.id, [skill.id]);
    await world.deploy.api.deploy(skill.id, "claude_code");
    const deployed = join(claude, "notes");
    expect(existsSync(deployed)).toBe(true);

    const result = await skills.api.removeMany([skill.id]);
    expect(result).toMatchObject({ succeeded: 1, failed: [] });
    expect(result.removedIds).toHaveLength(1);
    expect(existsSync(skill.libraryPath)).toBe(false);
    expect(existsSync(deployed)).toBe(false);
    expect(world.store.find(skill.id)).toBeNull();

    const [entry] = await storage.api.removed();
    expect(entry).toMatchObject({
      id: result.removedIds[0],
      name: "notes",
      originalPath: skill.libraryPath,
      place: "Library",
      reason: "deleted",
      library: true,
      occupied: false,
    });

    const restored = await storage.api.restoreRemoved(result.removedIds[0] ?? "");
    expect(restored).toEqual({ path: skill.libraryPath, displacedId: null });
    const back = world.store.get(skill.id);
    expect(back).toMatchObject({
      name: "notes",
      sourceRef: "/src/notes",
      sourceRevision: "abc",
      sourceTrustedHost: "cdn.example.com",
      suggestFor: ["*.md"],
      blockedAgents: ["codex"],
      libraryPath: skill.libraryPath,
      contentHash: skill.contentHash,
      deployments: [],
    });
    expect(back.tags.toSorted()).toEqual(["daily", "writing"]);
    expect(presets.skillIds(preset.id)).toEqual([skill.id]);
    expect(skillText(skill.libraryPath)).toContain("notes");
    expect(existsSync(join(skill.libraryPath, "ref.md"))).toBe(true);
    // Deployments are not brought back: the agent folder stays as the delete left it.
    expect(existsSync(deployed)).toBe(false);
    expect(await storage.api.removed()).toEqual([]);
  });

  it("refuses to restore over a skill that took the folder name since", async () => {
    const skill = world.addSkill("notes");
    const [removedId] = (await skills.api.removeMany([skill.id])).removedIds;
    const newer = world.addSkill("notes");

    const [entry] = await storage.api.removed();
    expect(entry).toMatchObject({ library: true, occupied: true });
    expect(await rejection(storage.api.restoreRemoved(removedId ?? ""))).toMatchObject({
      code: "ALREADY_EXISTS",
    });
    expect(world.store.get(newer.id).libraryPath).toBe(newer.libraryPath);
    expect(await storage.api.removed()).toHaveLength(1);
  });

  it("gives the restored skill a new id when its old one is taken", async () => {
    const skill = world.addSkill("notes");
    const [removedId] = (await skills.api.removeMany([skill.id])).removedIds;
    world.store.insert({
      id: skill.id,
      name: "other",
      description: null,
      sourceType: "local",
      libraryPath: makeSkill(world.ctx.paths.skillsDir, "other"),
      contentHash: null,
      updateStatus: "unknown",
    });

    await storage.api.restoreRemoved(removedId ?? "");
    const back = world.store.list().find((candidate) => candidate.name === "notes");
    expect(back?.id).not.toBe(skill.id);
    expect(back?.libraryPath).toBe(skill.libraryPath);
  });
});
