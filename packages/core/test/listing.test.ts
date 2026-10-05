import { join } from "node:path";
import { formatNumber } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hash from "../src/util/hash";
import { createListingService } from "../src/listing";
import { listingFindings } from "../src/health/listing";
import { makeSkill, writeFile } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld } from "./workspace-world";

const CLAUDE = "claude_code";
let world: WorkspaceWorld;

beforeEach(() => {
  world = createWorkspaceWorld();
  world.installAgents(".claude");
});
afterEach(() => world.cleanup());

const claudeDir = (...parts: string[]): string => join(world.home, ".claude", ...parts);
const skillsDir = (): string => claudeDir("skills");

function service() {
  return createListingService(world.ctx, {
    registry: world.registry,
    workspace: world.workspace.api,
  }).api;
}

/** A skill with a `SKILL.md` written exactly as given. */
function writeSkill(dir: string, name: string, frontmatter: string, body = "# Body\n"): void {
  writeFile(
    join(skillsDir(), dir, "SKILL.md"),
    `---\nname: ${name}\n${frontmatter}\n---\n\n${body}`,
  );
}

function installPlugin(key: string, skills: string[], enabled: boolean): void {
  const [name = key, market = "market"] = key.split("@");
  const installPath = claudeDir("plugins", "cache", market, name, "1.0.0");
  for (const skill of skills)
    makeSkill(join(installPath, "skills"), skill, { description: "Plugin skill." });
  writeFile(
    claudeDir("plugins", "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: { [key]: [{ scope: "user", installPath, version: "1.0.0" }] },
    }),
  );
  writeFile(claudeDir("settings.json"), JSON.stringify({ enabledPlugins: { [key]: enabled } }));
}

describe("skill listing service", () => {
  it("has no estimate for other agents, or when Claude Code is not on this machine", async () => {
    world.installAgents(".cursor");
    expect(await service().report("cursor")).toBeNull();
    expect(await service().report("nope")).toBeNull();
    const bare = createWorkspaceWorld();
    try {
      const other = createListingService(bare.ctx, {
        registry: bare.registry,
        workspace: bare.workspace.api,
      });
      expect(await other.api.report(CLAUDE)).toBeNull();
    } finally {
      bare.cleanup();
    }
  });

  it("costs each skill in the agent's folder, biggest first, reading only its document", async () => {
    writeSkill("small", "small", "description: Short.");
    writeSkill("large", "large", `description: ${"x".repeat(400)}`);
    const hashed = vi.spyOn(hash, "hashDir");
    const report = await service().report(CLAUDE);
    expect(hashed).not.toHaveBeenCalled();
    hashed.mockRestore();
    expect(report?.entries.map((entry) => entry.name)).toEqual(["large", "small"]);
    expect(report?.full).toBe(2);
    expect(report?.budget).toBe(8000);
    expect(report?.budgetSource).toBe("default");
    expect(report?.over).toBe(0);
    const [large] = report?.entries ?? [];
    expect(large?.chars).toBe("large".length + 4 + 400);
  });

  it("adds when_to_use, and falls back to the first line when there is no description", async () => {
    writeSkill(
      "triggers",
      "triggers",
      "description: Does things.\nwhen_to_use: When asked to do things.",
    );
    writeFile(
      join(skillsDir(), "bare", "SKILL.md"),
      "---\nname: bare\n---\n\n\nFirst real line\nsecond\n",
    );
    const report = await service().report(CLAUDE);
    const cost = (name: string): number | undefined =>
      report?.entries.find((entry) => entry.name === name)?.chars;
    expect(cost("triggers")).toBe(
      "triggers".length + 4 + "Does things. - When asked to do things.".length,
    );
    expect(cost("bare")).toBe("bare".length + 4 + "First real line".length);
  });

  it("leaves out skills that ask not to be picked, and follows skillOverrides", async () => {
    writeSkill("manual", "manual", "description: By hand.\ndisable-model-invocation: true");
    writeSkill("named", "named", "description: Long description here.");
    writeSkill("gone", "gone", "description: Hidden by settings.");
    writeSkill("kept", "kept", "description: Forced on.\ndisable-model-invocation: true");
    writeFile(
      claudeDir("settings.json"),
      JSON.stringify({
        skillOverrides: { named: "name-only", gone: "user-invocable-only", kept: "on" },
      }),
    );
    const report = await service().report(CLAUDE);
    const byName = Object.fromEntries((report?.entries ?? []).map((entry) => [entry.name, entry]));
    expect(byName.manual).toMatchObject({ mode: "hidden", hiddenBy: "frontmatter", chars: 0 });
    expect(byName.named).toMatchObject({ mode: "name_only", chars: "named".length + 4 });
    expect(byName.gone).toMatchObject({ mode: "hidden", hiddenBy: "override" });
    expect(byName.kept?.mode).toBe("full");
    expect([report?.full, report?.nameOnly, report?.hidden]).toEqual([1, 1, 2]);
  });

  it("counts plugin skills of switched-on plugins only", async () => {
    installPlugin("design@official", ["frontend-design"], true);
    expect((await service().report(CLAUDE))?.entries).toMatchObject([
      { name: "frontend-design", origin: "plugin", plugin: "design", mode: "full" },
    ]);
    installPlugin("design@official", ["frontend-design"], false);
    expect((await service().report(CLAUDE))?.entries).toEqual([]);
  });

  it("uses the budget the user set for Claude Code, and the window setting otherwise", async () => {
    writeSkill("a", "a", "description: A.");
    writeFile(claudeDir("settings.json"), JSON.stringify({ skillListingBudgetFraction: 0.02 }));
    expect(await service().report(CLAUDE)).toMatchObject({
      budget: 16000,
      budgetSource: "fraction",
    });
    writeFile(
      claudeDir("settings.json"),
      JSON.stringify({
        skillListingBudgetFraction: 0.02,
        env: { SLASH_COMMAND_TOOL_CHAR_BUDGET: "20000" },
      }),
    );
    expect(await service().report(CLAUDE)).toMatchObject({
      budget: 20000,
      budgetSource: "characters",
    });
    writeFile(claudeDir("settings.json"), "{}");
    world.ctx.settings.set("skillListingWindow", "1m");
    expect(await service().report(CLAUDE)).toMatchObject({ budget: 40000, window: "1m" });
  });

  it("honours skillListingMaxDescChars", async () => {
    writeSkill("wordy", "wordy", `description: ${"w".repeat(500)}`);
    writeFile(claudeDir("settings.json"), JSON.stringify({ skillListingMaxDescChars: 100 }));
    const [entry] = (await service().report(CLAUDE))?.entries ?? [];
    expect(entry).toMatchObject({ cut: true, chars: "wordy".length + 4 + 100 });
  });

  it("is not thrown off by a settings file that is broken or has the wrong types", async () => {
    writeSkill("a", "a", "description: A.");
    writeFile(claudeDir("settings.json"), "{ not json");
    expect((await service().report(CLAUDE))?.budgetSource).toBe("default");
    writeFile(
      claudeDir("settings.json"),
      JSON.stringify({
        skillOverrides: { a: 5 },
        skillListingBudgetFraction: "lots",
        skillListingMaxDescChars: -3,
        env: { SLASH_COMMAND_TOOL_CHAR_BUDGET: "many" },
      }),
    );
    expect(await service().report(CLAUDE)).toMatchObject({
      budget: 8000,
      budgetSource: "default",
      full: 1,
    });
  });

  it("changes nothing on disk", async () => {
    writeSkill("a", "a", "description: A.");
    writeFile(claudeDir("settings.json"), '{"skillOverrides":{"a":"on"}}');
    await service().report(CLAUDE);
    expect(world.store.list()).toEqual([]);
  });
});

describe("skill listing: doctor finding", () => {
  it("warns, naming the biggest skills, only when the listing is over budget", async () => {
    for (let i = 0; i < 30; i += 1) writeSkill(`s${i}`, `s${i}`, `description: ${"d".repeat(300)}`);
    const report = await service().report(CLAUDE);
    expect(report?.over).toBeGreaterThan(0);
    const [finding, ...rest] = listingFindings(report);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ area: "listing", severity: "warning", agent: CLAUDE });
    expect(finding?.message).toContain(`${formatNumber(report?.over ?? 0)} characters over`);
    expect(finding?.message).toContain("Biggest: s");
  });

  it("says nothing when it fits, or when there is no estimate", async () => {
    writeSkill("a", "a", "description: A.");
    expect(listingFindings(await service().report(CLAUDE))).toEqual([]);
    expect(listingFindings(null)).toEqual([]);
  });
});
