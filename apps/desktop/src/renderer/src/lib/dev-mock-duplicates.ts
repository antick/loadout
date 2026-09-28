/**
 * DEV ONLY. Which preview copies count as loaded twice, so the "Loaded twice" badge and notice can
 * be seen: Codex's `code-review` also sits in `~/.agents/skills`, and a project's
 * `code-review` is also installed globally for Claude Code. Claude Code's plugins bring a few
 * skills, one of them (`test-first`) also in its own folder.
 */
import type { PluginSkill, SkillDuplicate } from "@loadout/shared";
import { HOME } from "@/lib/dev-mock-data";

const SHARED_FOLDER = `${HOME}/.agents/skills`;
const GLOBAL_CLAUDE_FOLDER = `${HOME}/.claude/skills`;
const PLUGIN_CACHE = `${HOME}/.claude/plugins/cache`;
const TWICE_VIA_PLUGIN = "test-first";

function pluginSkill(plugin: string, name: string, enabled = true): PluginSkill {
  return {
    name,
    description: `The ${name} skill that comes with the ${plugin} plugin.`,
    path: `${PLUGIN_CACHE}/claude-plugins-official/${plugin}/1.2.0/skills/${name}`,
    plugin,
    marketplace: "claude-plugins-official",
    version: "1.2.0",
    enabled,
  };
}

const CLAUDE_PLUGIN_SKILLS: PluginSkill[] = [
  pluginSkill("frontend-design", "frontend-design"),
  pluginSkill("github", "pr-triage", false),
  pluginSkill("tdd", TWICE_VIA_PLUGIN),
];

/** Skills Claude Code's plugins bring; none for other agents. */
export function mockPluginSkills(agentKey: string): PluginSkill[] {
  return agentKey === "claude_code" ? CLAUDE_PLUGIN_SKILLS : [];
}

export function mockDuplicates(
  agentKey: string,
  dirName: string,
  root: string,
  agentDisplayName: string,
): SkillDuplicate[] {
  const isGlobal = root.startsWith(`${HOME}/.`);
  if (isGlobal && agentKey === "codex" && dirName === "code-review") {
    return [
      { where: "shared_folder", agentKey, agentDisplayName, path: `${SHARED_FOLDER}/${dirName}` },
    ];
  }
  if (isGlobal && agentKey === "claude_code" && dirName === TWICE_VIA_PLUGIN) {
    const plugin = CLAUDE_PLUGIN_SKILLS.find((skill) => skill.name === dirName);
    return plugin
      ? [{ where: "plugin", agentKey, agentDisplayName, path: plugin.path, plugin: plugin.plugin }]
      : [];
  }
  if (!isGlobal && agentKey === "claude_code" && dirName === "code-review") {
    return [
      {
        where: "global",
        agentKey,
        agentDisplayName,
        path: `${GLOBAL_CLAUDE_FOLDER}/${dirName}`,
      },
    ];
  }
  return [];
}
