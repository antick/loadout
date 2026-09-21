import type { LocalSkill } from "@loadout/shared";

/** What can be done with one folder of an agent's global skills folder. */
export interface AgentSkillRules {
  /** Copy it into the library. */
  upload: boolean;
  /** The upload overwrites an existing library copy, so ask first. */
  uploadNeedsConfirm: boolean;
  /** Replace the folder with the library version. */
  pull: boolean;
  /** Take the managed deployment out of this agent; the library copy stays. */
  remove: boolean;
  /** Removing would drop local edits the library does not have, so ask first. */
  removeNeedsConfirm: boolean;
  /** Delete a folder the app did not put there and has no copy of. */
  deleteLocal: boolean;
}

/**
 * Actions per sync status. A folder that matches the library but was not deployed for this agent
 * (for example one that lives in a folder shared with another agent) gets no actions at all.
 */
export function agentSkillRules(skill: LocalSkill): AgentSkillRules {
  const status = skill.syncStatus;
  const managed = skill.managed && skill.librarySkillId !== null;
  const upload = status !== "in_sync";
  return {
    upload,
    uploadNeedsConfirm: upload && status !== "local_only",
    pull: status === "library_newer" || status === "diverged",
    remove: managed,
    removeNeedsConfirm: managed && (status === "local_newer" || status === "diverged"),
    deleteLocal: !managed && status === "local_only",
  };
}

export interface AgentFolderSummary {
  total: number;
  managed: number;
  inSync: number;
}

export function summarizeAgentFolder(skills: readonly LocalSkill[]): AgentFolderSummary {
  return {
    total: skills.length,
    managed: skills.filter((skill) => skill.managed).length,
    inSync: skills.filter((skill) => skill.syncStatus === "in_sync").length,
  };
}
