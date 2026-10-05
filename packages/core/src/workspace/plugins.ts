import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type LocalSkill, type PluginSkill, type SkillDuplicate, isRecord } from "@loadout/shared";
import type { ResolvedAgent } from "../agents/registry";
import { readSkillIdentity } from "../skills/metadata";
import { isDirectory, isInside, isSkillDir, readDirSafe } from "../util/fs";

/**
 * Skills that come with an agent's plugins, read from the plugin manager's own files (Claude
 * Code: `plugins/installed_plugins.json`, `settings.json`). Only read, never changed: the plugin
 * manager installs, updates and removes them.
 */

const INSTALLED_FILE = "installed_plugins.json";
const SETTINGS_FILE = "settings.json";
const MANIFEST_FILE = join(".claude-plugin", "plugin.json");
const DEFAULT_SKILLS_DIR = "skills";
/** Plugins installed for everyone; project plugins only load inside their project. */
const USER_SCOPE = "user";

interface Installation {
  scope?: unknown;
  installPath?: unknown;
  version?: unknown;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** `name@marketplace` → its parts; a key without `@` has no marketplace. */
function splitKey(key: string): { plugin: string; marketplace: string | null } {
  const at = key.lastIndexOf("@");
  return at > 0
    ? { plugin: key.slice(0, at), marketplace: key.slice(at + 1) || null }
    : { plugin: key, marketplace: null };
}

/**
 * Switched-on state per plugin key. A plugin the settings do not name counts as on: installing
 * one switches it on, and only switching it off is written down for certain.
 */
function enabledPlugins(configDir: string): (key: string) => boolean {
  const settings = readJson(join(configDir, SETTINGS_FILE));
  const map =
    isRecord(settings) && isRecord(settings.enabledPlugins) ? settings.enabledPlugins : {};
  return (key) => map[key] !== false;
}

/** Folders the plugin keeps skills in: `skills/`, plus any its manifest names. */
function skillRoots(installPath: string): string[] {
  const roots = [join(installPath, DEFAULT_SKILLS_DIR)];
  const manifest = readJson(join(installPath, MANIFEST_FILE));
  const extra = isRecord(manifest) ? manifest.skills : undefined;
  const listed = typeof extra === "string" ? [extra] : Array.isArray(extra) ? extra : [];
  for (const entry of listed) {
    if (typeof entry !== "string") continue;
    const root = resolve(installPath, entry);
    // A manifest is someone else's file: it never sends us outside the plugin.
    if (isInside(installPath, root) && !roots.includes(root)) roots.push(root);
  }
  return roots;
}

function skillDirsIn(root: string): string[] {
  if (!isDirectory(root)) return [];
  if (isSkillDir(root)) return [root];
  return readDirSafe(root)
    .map((entry) => join(root, entry.name))
    .filter((path) => isSkillDir(path));
}

/** Every user-wide plugin's skills for `agent`, sorted by plugin then name. */
export function listPluginSkills(agent: Pick<ResolvedAgent, "pluginsDir">): PluginSkill[] {
  if (!agent.pluginsDir) return [];
  const installed = readJson(join(agent.pluginsDir, INSTALLED_FILE));
  const plugins = isRecord(installed) && isRecord(installed.plugins) ? installed.plugins : {};
  const isEnabled = enabledPlugins(dirname(agent.pluginsDir));
  const skills: PluginSkill[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(plugins)) {
    // Version 1 of the file held one installation per plugin, version 2 a list.
    const installations = (Array.isArray(value) ? value : [value]) as Installation[];
    for (const installation of installations) {
      if (!isRecord(installation)) continue;
      const scope = installation.scope ?? USER_SCOPE;
      const installPath = installation.installPath;
      if (scope !== USER_SCOPE || typeof installPath !== "string" || seen.has(installPath)) {
        continue;
      }
      seen.add(installPath);
      const { plugin, marketplace } = splitKey(key);
      for (const dir of skillRoots(installPath).flatMap(skillDirsIn)) {
        const identity = readSkillIdentity(dir);
        skills.push({
          name: identity.name,
          description: identity.description,
          path: dir,
          plugin,
          marketplace,
          version: typeof installation.version === "string" ? installation.version : null,
          enabled: isEnabled(key),
        });
      }
    }
  }
  return skills.sort((a, b) => a.plugin.localeCompare(b.plugin) || a.name.localeCompare(b.name));
}

/**
 * Mark skills of the agent's folder that a switched-on plugin also brings, by name. The agent
 * lists the plugin's copy under the plugin's name, so it sees the skill twice.
 */
export function withPluginDuplicates(
  agent: Pick<ResolvedAgent, "key" | "displayName">,
  skills: LocalSkill[],
  plugins: readonly PluginSkill[],
): LocalSkill[] {
  const byName = new Map<string, PluginSkill>();
  for (const plugin of plugins) {
    if (plugin.enabled && !byName.has(plugin.name.toLowerCase())) {
      byName.set(plugin.name.toLowerCase(), plugin);
    }
  }
  if (byName.size === 0) return skills;
  return skills.map((skill) => {
    const match = byName.get(skill.name.toLowerCase()) ?? byName.get(skill.dirName.toLowerCase());
    if (!match) return skill;
    const duplicate: SkillDuplicate = {
      where: "plugin",
      agentKey: agent.key,
      agentDisplayName: agent.displayName,
      path: match.path,
      plugin: match.plugin,
    };
    return { ...skill, duplicates: [...skill.duplicates, duplicate] };
  });
}
