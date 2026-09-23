import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import { installIntoLibrary } from "../src/install/library";
import { canonicalPath } from "../src/util/fs";
import { createWorkspaceService } from "../src/workspace";
import { makeSkill, writeFile } from "./helpers";
import {
  type WorkspaceWorld,
  createWorkspaceWorld,
  isLink,
  rejection,
  setContentMtime,
  skillText,
} from "./workspace-world";

const T0 = Date.UTC(2026, 0, 1);
const MINUTE = 60_000;

describe("global workspace", () => {
  let world: WorkspaceWorld;
  let claude: string;
  const api = () => world.workspace.api;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor", ".cline", ".warp", ".hermes");
    claude = join(world.home, ".claude", "skills");
  });
  afterEach(() => world.cleanup());

  /** A local folder that differs from `skill` in the library, dated relative to it. */
  function editedCopy(dirName: string, libraryPath: string, offsetMs: number): string {
    const local = makeSkill(claude, dirName, { body: "edited by hand" });
    setContentMtime(libraryPath, T0);
    setContentMtime(local, T0 + offsetMs);
    return local;
  }

  it("lists managed and unmanaged skills with status, tags, and attention first", async () => {
    const managed = world.addSkill("managed");
    world.store.setTags(managed.id, ["writing"]);
    await world.deploy.api.deploy(managed.id, "claude_code");
    const newer = world.addSkill("newer");
    world.store.update(newer.id, { sourceRef: join(claude, "newer") });
    editedCopy("newer", newer.libraryPath, MINUTE);
    const older = world.addSkill("older");
    world.store.update(older.id, { sourceRef: join(claude, "older") });
    editedCopy("older", older.libraryPath, -MINUTE);
    makeSkill(claude, "aaa-solo");
    // Same name as a library skill, different content, no recorded link: never matched by name.
    world.addSkill("lookalike");
    makeSkill(claude, "lookalike", { body: "unrelated" });

    const skills = await api().list("claude_code");
    expect(skills.map((s) => [s.dirName, s.syncStatus, s.managed])).toEqual([
      ["aaa-solo", "local_only", false],
      ["lookalike", "local_only", false],
      ["newer", "local_newer", false],
      ["older", "library_newer", false],
      ["managed", "in_sync", true],
    ]);
    const row = skills.find((s) => s.dirName === "managed");
    expect(row).toMatchObject({
      librarySkillId: managed.id,
      tags: ["writing"],
      enabled: true,
      agentKey: "claude_code",
      agentDisplayName: "Claude Code",
      relativePath: "managed",
    });
  });

  it("says whether each skill is a link and where it leads", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    world.ctx.settings.set("deployMode", "copy");
    await world.deploy.api.deploy(beta.id, "claude_code");
    makeSkill(claude, "own");

    const byName = new Map((await api().list("claude_code")).map((skill) => [skill.name, skill]));
    expect(byName.get("alpha")?.linkTarget).toBe(canonicalPath(alpha.libraryPath));
    expect(byName.get("beta")?.linkTarget).toBeNull();
    expect(byName.get("beta")?.managed).toBe(true);
    expect(byName.get("own")?.linkTarget).toBeNull();
  });

  it("shows a shared folder's skill under the sibling agent as in sync but not managed", async () => {
    const skill = world.addSkill("shared");
    await world.deploy.api.deploy(skill.id, "cline");
    const [underCline] = await api().list("cline");
    const [underWarp] = await api().list("warp");
    expect(underCline).toMatchObject({ syncStatus: "in_sync", managed: true });
    expect(underWarp).toMatchObject({
      syncStatus: "in_sync",
      managed: false,
      librarySkillId: skill.id,
    });
  });

  it("scans only the agent's own skills folder, in depth only for agents that nest", async () => {
    makeSkill(join(world.home, ".agents", "skills"), "extra-dir-skill");
    makeSkill(join(world.home, ".codex", "skills"), "own");
    makeSkill(join(world.home, ".codex", "skills", "group"), "nested");
    makeSkill(join(world.home, ".hermes", "skills", "research"), "web");
    expect((await api().list("codex")).map((s) => s.relativePath)).toEqual(["own"]);
    expect((await api().list("hermes")).map((s) => s.relativePath)).toEqual(["research/web"]);
    expect((await rejection(api().list("nobody"))).code).toBe("NOT_FOUND");
  });

  it("counts what is on disk, falling back to deployments when the folder is gone", async () => {
    makeSkill(claude, "one");
    makeSkill(claude, "two");
    const skill = world.addSkill("deployed");
    world.store.upsertDeployment(
      skill.id,
      "cursor",
      join(world.home, ".cursor", "skills", "deployed"),
      "copy",
      skill.contentHash,
    );
    expect(await api().counts(["claude_code", "cursor", "codex", "nobody"])).toEqual({
      claude_code: 2,
      cursor: 1,
      codex: 0,
    });
  });

  it("reads a document, refusing paths and linked documents that leave the folder", async () => {
    makeSkill(claude, "plain", { body: "hello" });
    const doc = await api().document("claude_code", "plain");
    expect(doc).toMatchObject({ filename: "SKILL.md", path: join(claude, "plain") });
    expect(doc.content).toContain("hello");
    expect(doc.files).toEqual(["SKILL.md"]);

    expect((await rejection(api().document("claude_code", "../plain"))).code).toBe("INVALID_INPUT");
    expect((await rejection(api().document("claude_code", "missing"))).code).toBe("NOT_FOUND");

    // Only a case-sensitive disk can hold a real `skill.md` next to a linked `SKILL.md`.
    const secret = join(world.root, "secret.md");
    writeFile(secret, "outside");
    const leaky = join(claude, "leaky");
    writeFile(join(leaky, "skill.md"), "---\nname: leaky\n---\n");
    if (!existsSync(join(leaky, "SKILL.md"))) {
      symlinkSync(secret, join(leaky, "SKILL.md"));
      expect((await api().document("claude_code", "leaky")).content).toBe("");
    }

    // A deployed link resolves into the library; that is the skill's own folder, so it reads.
    const managed = world.addSkill("managed");
    await world.deploy.api.deploy(managed.id, "claude_code");
    expect((await api().document("claude_code", "managed")).filename).toBe("SKILL.md");
  });

  it("uploads an unmatched skill as a new local skill and adopts the folder", async () => {
    world.addSkill("notes");
    const local = makeSkill(claude, "notes", { body: "my own notes" });

    const skill = await api().upload("claude_code", "notes");
    expect(skill).toMatchObject({
      name: "notes-2",
      dirName: "notes-2",
      sourceType: "local",
      updateStatus: "local_only",
    });
    expect(skillText(skill.libraryPath)).toContain("my own notes");
    expect(skill.presetIds).toEqual([]);

    // Deployments are named after the library folder, so the old folder made way for the link.
    const target = join(claude, "notes-2");
    expect(isLink(target)).toBe(true);
    expect(existsSync(local)).toBe(false);
    expect(world.store.deployment(skill.id, "claude_code")?.targetPath).toBe(target);
    // Nothing keeps naming the replaced folder as its source.
    expect(skill.sourceRef).toBe(skill.libraryPath);

    const listed = (await api().list("claude_code")).find((s) => s.dirName === "notes-2");
    expect(listed).toMatchObject({ managed: true, syncStatus: "in_sync" });
  });

  it("adopts in place when the folder already has the library folder's name", async () => {
    const local = makeSkill(claude, "fresh", { body: "brand new" });
    const skill = await api().upload("claude_code", "fresh");
    expect(skill.dirName).toBe("fresh");
    expect(isLink(local)).toBe(true);
    expect(skillText(local)).toContain("brand new");
  });

  it("uploads over the matched skill, keeps its source, and refreshes deployed copies", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("helper");
    world.store.update(skill.id, { sourceType: "git", sourceRef: "https://example.test/r.git" });
    await world.deploy.api.deploy(skill.id, "claude_code");
    await world.deploy.api.deploy(skill.id, "cursor");
    writeFile(join(claude, "helper", "SKILL.md"), "---\nname: helper\ndescription: v2\n---\nv2\n");

    const updated = await api().upload("claude_code", "helper");
    expect(updated.id).toBe(skill.id);
    expect(updated).toMatchObject({
      sourceType: "git",
      sourceRef: "https://example.test/r.git",
      updateStatus: "local_only",
      description: "v2",
    });
    expect(updated.contentHash).not.toBe(skill.contentHash);
    expect(skillText(updated.libraryPath)).toContain("v2");
    expect(skillText(join(world.home, ".cursor", "skills", "helper"))).toContain("v2");
    expect(world.store.list()).toHaveLength(1);
  });

  it("moves a nested skill to where deployments live, only once the library holds it", async () => {
    const nested = makeSkill(join(world.home, ".hermes", "skills", "research"), "web");
    const skill = await api().upload("hermes", "research/web");
    expect(existsSync(nested)).toBe(false);
    expect(isLink(join(world.home, ".hermes", "skills", "web"))).toBe(true);
    expect(world.store.deployment(skill.id, "hermes")).not.toBeNull();
  });

  it("refuses to adopt over an unrelated folder and keeps both folders", async () => {
    world.addSkill("web");
    makeSkill(join(world.home, ".hermes", "skills"), "web-2", { body: "somebody else's" });
    const nested = makeSkill(join(world.home, ".hermes", "skills", "research"), "web", {
      body: "mine",
    });
    const error = await rejection(api().upload("hermes", "research/web"));
    expect(error.code).toBe("ALREADY_EXISTS");
    expect(existsSync(nested)).toBe(true);
    expect(skillText(join(world.home, ".hermes", "skills", "web-2"))).toContain("somebody else's");
    expect(world.store.list().map((s) => s.name)).toEqual(["web"]);
  });

  it("drops the new row but keeps the library folder when adoption fails", async () => {
    const { ctx, store, registry, deploy } = world;
    const failing = createWorkspaceService(ctx, {
      store,
      registry,
      install: { installIntoLibrary: (request) => installIntoLibrary(ctx, store, request) },
      deploy: {
        ...deploy,
        adopt: async () => {
          throw new AppError("IO", "disk full");
        },
      },
    });
    const local = makeSkill(claude, "fragile", { body: "only copy" });
    const error = await rejection(failing.api.upload("claude_code", "fragile"));
    expect(error.message).toBe("disk full");
    expect(store.list()).toEqual([]);
    expect(skillText(join(ctx.paths.skillsDir, "fragile"))).toContain("only copy");
    expect(skillText(local)).toContain("only copy");
  });

  it("refuses to pull over a newer local skill, and pulls a stale one without a row", async () => {
    const skill = world.addSkill("doc");
    world.store.update(skill.id, { sourceRef: join(claude, "doc") });
    const local = editedCopy("doc", skill.libraryPath, MINUTE);
    const error = await rejection(api().pull("claude_code", "doc"));
    expect(error.message).toBe("Local skill is newer than the library version");
    expect(skillText(local)).toContain("edited by hand");

    setContentMtime(local, T0 - MINUTE);
    await api().pull("claude_code", "doc");
    expect(isLink(local)).toBe(false);
    expect(skillText(local)).toBe(skillText(skill.libraryPath));
    expect(world.store.deployments()).toEqual([]);
    expect((await api().list("claude_code"))[0]?.syncStatus).toBe("in_sync");

    makeSkill(claude, "stranger");
    expect((await rejection(api().pull("claude_code", "stranger"))).code).toBe("NOT_FOUND");
  });

  it("pulls a hand-edited managed copy back and keeps its deployment row", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("doc");
    await world.deploy.api.deploy(skill.id, "claude_code");
    const local = join(claude, "doc");
    writeFile(join(local, "SKILL.md"), "---\nname: doc\n---\nbroken by hand\n");
    setContentMtime(skill.libraryPath, T0);
    setContentMtime(local, T0 + 500);
    expect((await api().list("claude_code"))[0]?.syncStatus).toBe("diverged");

    await api().pull("claude_code", "doc");
    expect(skillText(local)).toBe(skillText(skill.libraryPath));
    expect(world.store.deployment(skill.id, "claude_code")).toMatchObject({
      mode: "copy",
      targetPath: local,
    });
  });

  it("deletes a local skill, but never one a deployment points at", async () => {
    const managed = world.addSkill("managed");
    await world.deploy.api.deploy(managed.id, "cline");
    // The sibling agent of a shared folder has no row of its own; the path is still ours.
    const refused = await rejection(api().deleteLocal("warp", "managed"));
    expect(refused.message).toBe(
      `Skill is managed by ${APP_NAME} — remove it from the agent first.`,
    );
    expect(existsSync(join(world.home, ".agents", "skills", "managed"))).toBe(true);

    const outside = makeSkill(join(world.root, "elsewhere"), "linked");
    mkdirSync(claude, { recursive: true });
    symlinkSync(outside, join(claude, "linked"), "dir");
    makeSkill(claude, "plain");
    await api().deleteLocal("claude_code", "linked");
    await api().deleteLocal("claude_code", "plain");
    expect(await api().list("claude_code")).toEqual([]);
    // The link went, not what it pointed at.
    expect(existsSync(join(outside, "SKILL.md"))).toBe(true);
    expect((await rejection(api().deleteLocal("claude_code", "../x"))).code).toBe("INVALID_INPUT");
  });
});
