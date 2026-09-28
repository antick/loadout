import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSkill, writeFile } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld } from "./workspace-world";

let world: WorkspaceWorld;
const CLAUDE = "claude_code";

beforeEach(() => {
  world = createWorkspaceWorld();
  world.installAgents(".claude");
});
afterEach(() => world.cleanup());

const claudeDir = (...parts: string[]): string => join(world.home, ".claude", ...parts);
const cacheDir = (...parts: string[]): string => claudeDir("plugins", "cache", ...parts);

/** A plugin installed the way Claude Code's plugin manager records it. */
function installPlugins(
  plugins: Record<string, { skills: string[]; scope?: string; manifestSkills?: string }>,
  enabled: Record<string, boolean> = {},
): void {
  const records: Record<string, unknown[]> = {};
  for (const [key, plugin] of Object.entries(plugins)) {
    const [name = key, market = "market"] = key.split("@");
    const installPath = cacheDir(market, name, "1.0.0");
    for (const skill of plugin.skills) makeSkill(join(installPath, "skills"), skill);
    if (plugin.manifestSkills) {
      makeSkill(installPath, plugin.manifestSkills);
      writeFile(
        join(installPath, ".claude-plugin", "plugin.json"),
        JSON.stringify({ name, skills: [`./${plugin.manifestSkills}`, "../../escape"] }),
      );
    }
    records[key] = [{ scope: plugin.scope ?? "user", installPath, version: "1.0.0" }];
  }
  writeFile(
    claudeDir("plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: records }),
  );
  writeFile(claudeDir("settings.json"), JSON.stringify({ enabledPlugins: enabled }));
}

describe("plugin skills", () => {
  it("lists the skills of user-wide plugins, switched on or off", async () => {
    installPlugins(
      {
        "design@official": { skills: ["frontend-design"], manifestSkills: "extra-skill" },
        "review@official": { skills: ["code-review"] },
        "local@official": { skills: ["project-only"], scope: "project" },
      },
      { "review@official": false },
    );
    const skills = await world.workspace.api.plugins(CLAUDE);
    expect(
      skills.map(({ name, plugin, marketplace, enabled }) => ({
        name,
        plugin,
        marketplace,
        enabled,
      })),
    ).toEqual([
      { name: "extra-skill", plugin: "design", marketplace: "official", enabled: true },
      { name: "frontend-design", plugin: "design", marketplace: "official", enabled: true },
      { name: "code-review", plugin: "review", marketplace: "official", enabled: false },
    ]);
  });

  it("is empty for agents without plugins and when nothing is installed", async () => {
    world.installAgents(".cursor");
    expect(await world.workspace.api.plugins("cursor")).toEqual([]);
    expect(await world.workspace.api.plugins(CLAUDE)).toEqual([]);
    writeFile(claudeDir("plugins", "installed_plugins.json"), "{ not json");
    expect(await world.workspace.api.plugins(CLAUDE)).toEqual([]);
  });

  it("warns that a skill in the agent's folder is loaded twice when a plugin brings it too", async () => {
    installPlugins(
      { "design@official": { skills: ["frontend-design"] }, "off@official": { skills: ["pdf"] } },
      { "off@official": false },
    );
    makeSkill(claudeDir("skills"), "frontend-design");
    makeSkill(claudeDir("skills"), "pdf");
    const skills = await world.workspace.api.list(CLAUDE);
    const design = skills.find((skill) => skill.name === "frontend-design");
    expect(design?.duplicates).toEqual([
      {
        where: "plugin",
        agentKey: CLAUDE,
        agentDisplayName: "Claude Code",
        path: cacheDir("official", "design", "1.0.0", "skills", "frontend-design"),
        plugin: "design",
      },
    ]);
    // A switched-off plugin loads nothing.
    expect(skills.find((skill) => skill.name === "pdf")?.duplicates).toEqual([]);
  });
});
