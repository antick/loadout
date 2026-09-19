import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME, type DeployMode } from "@skillboard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type OwnershipPolicy,
  type TargetState,
  authorize,
  classifyTarget,
  removeTarget,
  writeTarget,
} from "../src/deploy";
import { AppError } from "../src/errors";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { makeSkill, tempDir, writeFile } from "./helpers";

const UNMANAGED = `is not managed by ${APP_NAME}`;
const MISMATCH = "does not match its recorded deployment";
const IRREPLACEABLE = "cannot be replaced";

const isLink = (path: string): boolean => lstatSync(path).isSymbolicLink();

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const recorded = (mode: DeployMode): OwnershipPolicy => ({ kind: "recorded", mode });

describe("ownership table", () => {
  const cases: [OwnershipPolicy, TargetState, string | null][] = [
    [{ kind: "no_clobber" }, "absent", null],
    [{ kind: "no_clobber" }, "link_to_source", null],
    [{ kind: "no_clobber" }, "foreign_link", UNMANAGED],
    [{ kind: "no_clobber" }, "real_dir", UNMANAGED],
    [{ kind: "no_clobber" }, "real_file", UNMANAGED],
    [recorded("symlink"), "absent", null],
    [recorded("symlink"), "link_to_source", null],
    [recorded("symlink"), "foreign_link", null],
    [recorded("symlink"), "real_dir", MISMATCH],
    [recorded("symlink"), "real_file", IRREPLACEABLE],
    [recorded("copy"), "absent", null],
    [recorded("copy"), "link_to_source", null],
    [recorded("copy"), "foreign_link", MISMATCH],
    [recorded("copy"), "real_dir", null],
    [recorded("copy"), "real_file", IRREPLACEABLE],
    [{ kind: "user_confirmed" }, "foreign_link", null],
    [{ kind: "user_confirmed" }, "real_dir", null],
    [{ kind: "user_confirmed" }, "real_file", null],
  ];

  it.each(cases)("%o on %s", (policy, state, expected) => {
    expect(authorize(state, policy)).toBe(expected);
  });
});

describe("deploy engine", () => {
  let temp: ReturnType<typeof tempDir>;
  let source: string;
  let target: string;

  beforeEach(() => {
    temp = tempDir();
    source = makeSkill(join(temp.dir, "library"), "alpha", { files: { "notes/a.txt": "a" } });
    target = join(temp.dir, "agent", "skills", "alpha");
  });
  afterEach(() => temp.cleanup());

  it("classifies a target without following links", () => {
    expect(classifyTarget(target, source)).toBe("absent");
    mkdirSync(join(temp.dir, "agent", "skills"), { recursive: true });

    symlinkSync(source, target, "dir");
    expect(classifyTarget(target, source)).toBe("link_to_source");

    const alias = join(temp.dir, "alias");
    symlinkSync(join(temp.dir, "library"), alias, "dir");
    const viaAlias = join(temp.dir, "agent", "skills", "via-alias");
    symlinkSync(join(alias, "alpha"), viaAlias, "dir");
    expect(classifyTarget(viaAlias, source)).toBe("link_to_source");

    const dangling = join(temp.dir, "agent", "skills", "dangling");
    symlinkSync(join(temp.dir, "nowhere"), dangling, "dir");
    expect(classifyTarget(dangling, source)).toBe("foreign_link");

    const other = makeSkill(join(temp.dir, "library"), "other");
    const foreign = join(temp.dir, "agent", "skills", "foreign");
    symlinkSync(other, foreign, "dir");
    expect(classifyTarget(foreign, source)).toBe("foreign_link");

    expect(classifyTarget(other, source)).toBe("real_dir");
    expect(classifyTarget(join(other, "SKILL.md"), source)).toBe("real_file");
  });

  it("links and copies, reporting the mode it used", async () => {
    expect(await writeTarget(source, target, "symlink", { kind: "no_clobber" })).toBe("symlink");
    expect(isLink(target)).toBe(true);
    expect(readFileSync(join(target, "notes/a.txt"), "utf8")).toBe("a");

    // Switching to a copy replaces our own link, never the library behind it.
    expect(await writeTarget(source, target, "copy", { kind: "no_clobber" })).toBe("copy");
    expect(isLink(target)).toBe(false);
    expect(readFileSync(join(target, "notes/a.txt"), "utf8")).toBe("a");
    expect(existsSync(join(source, "SKILL.md"))).toBe(true);
  });

  it("refuses content it cannot prove it owns and leaves it untouched", async () => {
    writeFile(join(target, "mine.txt"), "precious");
    const error = await rejection(writeTarget(source, target, "symlink", { kind: "no_clobber" }));
    expect(error.code).toBe("TARGET_CONFLICT");
    expect(error.details?.conflicts).toEqual([{ path: target, reason: UNMANAGED }]);
    expect(readFileSync(join(target, "mine.txt"), "utf8")).toBe("precious");

    const mismatch = await rejection(
      writeTarget(source, target, "symlink", { kind: "recorded", mode: "symlink" }),
    );
    expect(mismatch.details?.conflicts?.[0]?.reason).toBe(MISMATCH);
    expect(readFileSync(join(target, "mine.txt"), "utf8")).toBe("precious");
  });

  it("replaces a recorded copy and anything the user confirmed", async () => {
    writeFile(join(target, "stale.txt"), "old");
    await writeTarget(source, target, "copy", { kind: "recorded", mode: "copy" });
    expect(existsSync(join(target, "stale.txt"))).toBe(false);
    expect(existsSync(join(target, "SKILL.md"))).toBe(true);

    const file = join(temp.dir, "agent", "skills", "beta");
    writeFile(file, "a plain file");
    const blocked = await rejection(
      writeTarget(source, file, "symlink", { kind: "recorded", mode: "symlink" }),
    );
    expect(blocked.details?.conflicts?.[0]?.reason).toBe(IRREPLACEABLE);
    await writeTarget(source, file, "symlink", { kind: "user_confirmed" });
    expect(isLink(file)).toBe(true);
  });

  it("refuses equal or nested source and target", async () => {
    const inside = join(source, "nested");
    mkdirSync(inside);
    const policy: OwnershipPolicy = { kind: "user_confirmed" };
    expect((await rejection(writeTarget(source, source, "copy", policy))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(writeTarget(source, inside, "copy", policy))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(writeTarget(inside, source, "copy", policy))).code).toBe(
      "INVALID_INPUT",
    );
    expect(existsSync(join(source, "SKILL.md"))).toBe(true);
  });

  it("removes only what the record describes", async () => {
    await writeTarget(source, target, "symlink", { kind: "no_clobber" });
    expect(removeTarget(target, "copy")).toBe(false);
    expect(isLink(target)).toBe(true);
    expect(removeTarget(target, "symlink")).toBe(true);
    expect(existsSync(join(source, "SKILL.md"))).toBe(true);

    writeFile(join(target, "mine.txt"), "precious");
    expect(removeTarget(target, "symlink")).toBe(false);
    expect(readFileSync(join(target, "mine.txt"), "utf8")).toBe("precious");
    expect(removeTarget(target, "copy")).toBe(true);
    expect(removeTarget(target, "copy")).toBe(false);
  });
});

describe("deploy service", () => {
  let world: DeployWorld;
  const claudeTarget = (dirName: string): string => join(world.home, ".claude", "skills", dirName);
  const sharedTarget = (dirName: string): string => join(world.home, ".agents", "skills", dirName);

  beforeEach(() => {
    world = createDeployWorld();
    world.installAgents(".claude", ".cline", ".warp");
  });
  afterEach(() => world.cleanup());

  it("deploys a link, records it, and does nothing the second time", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(isLink(claudeTarget("alpha"))).toBe(true);
    const row = world.store.deployment(skill.id, "claude_code");
    expect(row).toMatchObject({ mode: "symlink", sourceHash: skill.contentHash });
    expect(row?.targetPath).toBe(claudeTarget("alpha"));

    await world.deploy.api.deploy(skill.id, "claude_code");
    const history = world.ctx.activity.list().filter((entry) => entry.kind === "deploy");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ subject: "alpha", detail: "Claude Code", ok: true });
  });

  it("refuses agents that are missing, not installed or disabled", async () => {
    const skill = world.addSkill("alpha");
    expect((await rejection(world.deploy.api.deploy(skill.id, "nope"))).code).toBe("NOT_FOUND");
    const missing = await rejection(world.deploy.api.deploy(skill.id, "cursor"));
    expect(missing).toMatchObject({ code: "INVALID_INPUT", message: "Cursor is not installed" });
    await world.agents.api.setEnabled("claude_code", false);
    const disabled = await rejection(world.deploy.api.deploy(skill.id, "claude_code"));
    expect(disabled.message).toBe("Claude Code is disabled in Settings");
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
  });

  it("copies, skips while current, and re-copies when the library changed", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(isLink(claudeTarget("alpha"))).toBe(false);
    expect(world.store.deployment(skill.id, "claude_code")?.mode).toBe("copy");

    const marker = join(claudeTarget("alpha"), "marker.txt");
    writeFile(marker, "still here means nothing was rewritten");
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(existsSync(marker)).toBe(true);

    writeFile(join(skill.libraryPath, "new.txt"), "fresh");
    const updated = world.rehash(skill);
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(join(claudeTarget("alpha"), "new.txt"), "utf8")).toBe("fresh");
    expect(world.store.deployment(skill.id, "claude_code")?.sourceHash).toBe(updated.contentHash);
  });

  it("refuses an unmanaged folder at the target and leaves it untouched", async () => {
    const skill = world.addSkill("alpha");
    writeFile(join(claudeTarget("alpha"), "mine.txt"), "precious");
    const error = await rejection(world.deploy.api.deploy(skill.id, "claude_code"));
    expect(error.code).toBe("TARGET_CONFLICT");
    expect(error.details?.conflicts?.[0]).toEqual({
      path: claudeTarget("alpha"),
      reason: UNMANAGED,
    });
    expect(readFileSync(join(claudeTarget("alpha"), "mine.txt"), "utf8")).toBe("precious");
    expect(world.store.deployment(skill.id, "claude_code")).toBeNull();
  });

  it.each<DeployMode>(["symlink", "copy"])(
    "keeps a shared folder until its last agent lets go (%s)",
    async (mode) => {
      world.ctx.settings.set("deployMode", mode);
      const skill = world.addSkill("alpha");
      const result = await world.deploy.api.apply([skill.id], ["cline", "warp"], "add");
      expect(result).toMatchObject({ added: 2, conflicts: [], failed: [] });
      const rows = world.store.deployments();
      expect(rows.map((row) => row.agentKey).sort()).toEqual(["cline", "warp"]);
      expect(new Set(rows.map((row) => row.targetPath))).toEqual(new Set([sharedTarget("alpha")]));
      expect(new Set(rows.map((row) => row.mode))).toEqual(new Set([mode]));

      await world.deploy.api.undeploy(skill.id, "cline");
      expect(existsSync(join(sharedTarget("alpha"), "SKILL.md"))).toBe(true);
      expect(world.store.deployment(skill.id, "cline")).toBeNull();

      await world.deploy.api.undeploy(skill.id, "warp");
      expect(existsSync(sharedTarget("alpha"))).toBe(false);
      expect(existsSync(join(skill.libraryPath, "SKILL.md"))).toBe(true);
    },
  );

  it("treats rows that disagree on the mode as no proof of ownership", async () => {
    const skill = world.addSkill("alpha");
    writeFile(join(sharedTarget("alpha"), "mine.txt"), "precious");
    world.store.upsertDeployment(skill.id, "cline", sharedTarget("alpha"), "symlink", null);
    world.store.upsertDeployment(skill.id, "warp", sharedTarget("alpha"), "copy", null);
    const error = await rejection(world.deploy.api.deploy(skill.id, "cline"));
    expect(error.details?.conflicts?.[0]?.reason).toBe(UNMANAGED);
    expect(readFileSync(join(sharedTarget("alpha"), "mine.txt"), "utf8")).toBe("precious");
  });

  it("drops the row but keeps content that no longer matches the record", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(removeTarget(claudeTarget("alpha"), "symlink")).toBe(true);
    writeFile(join(claudeTarget("alpha"), "mine.txt"), "the user put a real folder here");

    await world.deploy.api.undeploy(skill.id, "claude_code");
    expect(world.store.deployment(skill.id, "claude_code")).toBeNull();
    expect(existsSync(join(claudeTarget("alpha"), "mine.txt"))).toBe(true);
    const last = world.ctx.activity.list()[0];
    expect(last).toMatchObject({ kind: "undeploy", subject: "alpha", detail: "Claude Code" });
  });

  it("writes nothing when one target in a batch is refused", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    writeFile(join(claudeTarget("beta"), "mine.txt"), "precious");
    const result = await world.deploy.api.apply(
      [alpha.id, beta.id],
      ["claude_code", "cline", "warp"],
      "add",
    );
    expect(result.added).toBe(0);
    expect(result.conflicts).toEqual([{ path: claudeTarget("beta"), reason: UNMANAGED }]);
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
    expect(existsSync(sharedTarget("alpha"))).toBe(false);
    expect(world.store.deployments()).toEqual([]);
    expect(readFileSync(join(claudeTarget("beta"), "mine.txt"), "utf8")).toBe("precious");
  });

  it("skips unavailable agents and pairs already deployed, then removes in batch", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    const added = await world.deploy.api.apply(
      [alpha.id, beta.id, "gone"],
      ["claude_code", "cursor", "unknown"],
      "add",
    );
    expect(added).toMatchObject({ added: 1, skipped: 5, conflicts: [] });
    expect(added.failed).toHaveLength(1);
    expect(isLink(claudeTarget("beta"))).toBe(true);

    const removed = await world.deploy.api.apply(
      [alpha.id, beta.id],
      ["claude_code", "cursor"],
      "remove",
    );
    expect(removed).toMatchObject({ removed: 2, skipped: 2, failed: [] });
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
    expect(existsSync(claudeTarget("beta"))).toBe(false);
  });

  it("refuses a path that holds a different skill's deployment", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    // A stale row of another skill claims the same folder.
    world.store.upsertDeployment(beta.id, "cline", claudeTarget("alpha"), "symlink", null);
    world.ctx.settings.set("deployMode", "copy");
    const error = await rejection(world.deploy.api.deploy(alpha.id, "claude_code"));
    expect(error.code).toBe("TARGET_CONFLICT");
    expect(isLink(claudeTarget("alpha"))).toBe(true);
  });

  it("removes every deployment of a skill or an agent, and nothing else", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.apply([alpha.id, beta.id], ["claude_code", "cline", "warp"], "add");
    writeFile(join(claudeTarget("handmade"), "SKILL.md"), "not ours");

    expect(await world.deploy.removeAllForAgent("claude_code")).toBe(2);
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
    expect(existsSync(join(claudeTarget("handmade"), "SKILL.md"))).toBe(true);

    await world.deploy.removeAllForAgent("cline");
    expect(existsSync(sharedTarget("alpha"))).toBe(true);

    await world.deploy.removeAllForSkill(alpha);
    expect(existsSync(sharedTarget("alpha"))).toBe(false);
    expect(existsSync(sharedTarget("beta"))).toBe(true);
    expect(world.store.deployments().map((row) => row.skillId)).toEqual([beta.id]);
  });

  it("refreshes copies after the library changed, once per shared folder", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("alpha");
    await world.deploy.api.apply([skill.id], ["claude_code", "cline", "warp"], "add");
    writeFile(join(skill.libraryPath, "new.txt"), "fresh");
    const updated = world.rehash(skill);

    const report = await world.deploy.refreshCopies(updated);
    expect(report).toEqual({ written: 2, conflicts: [], failed: [] });
    expect(readFileSync(join(claudeTarget("alpha"), "new.txt"), "utf8")).toBe("fresh");
    expect(readFileSync(join(sharedTarget("alpha"), "new.txt"), "utf8")).toBe("fresh");
    for (const row of world.store.deployments()) {
      expect(row).toMatchObject({ mode: "copy", sourceHash: updated.contentHash });
    }
  });

  it("reports a copy the user swapped out instead of overwriting it", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(removeTarget(claudeTarget("alpha"), "copy")).toBe(true);
    mkdirSync(join(world.home, "elsewhere"));
    symlinkSync(join(world.home, "elsewhere"), claudeTarget("alpha"), "dir");
    writeFile(join(skill.libraryPath, "new.txt"), "fresh");

    const report = await world.deploy.refreshCopies(world.rehash(skill));
    expect(report.written).toBe(0);
    expect(report.conflicts).toEqual([{ path: claudeTarget("alpha"), reason: MISMATCH }]);
    expect(existsSync(join(world.home, "elsewhere"))).toBe(true);
  });

  it("adopts an existing folder when the user confirmed it", async () => {
    const existing = makeSkill(join(world.home, ".claude", "skills"), "alpha");
    const skill = world.store.update(world.addSkill("alpha").id, { sourceRef: existing });
    await world.deploy.adopt(skill, world.registry.get("claude_code"));
    expect(isLink(claudeTarget("alpha"))).toBe(true);
    expect(world.store.deployment(skill.id, "claude_code")?.mode).toBe("symlink");
    expect(world.store.get(skill.id).sourceRef).toBe(skill.libraryPath);
  });
});
