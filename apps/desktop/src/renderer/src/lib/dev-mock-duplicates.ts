/**
 * DEV ONLY. Which preview copies count as loaded twice, so the "Loaded twice" badge and notice can
 * be seen: Codex's `code-review` also sits in `~/.agents/skills`, and a project's
 * `code-review` is also installed globally for Claude Code.
 */
import type { SkillDuplicate } from "@loadout/shared";
import { HOME } from "@/lib/dev-mock-data";

const SHARED_FOLDER = `${HOME}/.agents/skills`;
const GLOBAL_CLAUDE_FOLDER = `${HOME}/.claude/skills`;

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
