import type { Preset } from "@skillboard/shared";

export type PresetBarMode = "agent-pair" | "logical-skill";
export type PresetActivity = "empty" | "active" | "partial" | "inactive";

export interface SkillAgentPair {
  skillId: string;
  agentKey: string;
}

export interface PresetState {
  activity: PresetActivity;
  /** Units counted as installed: pairs in agent-pair mode, whole skills in logical-skill mode. */
  installed: number;
  total: number;
  /** Pairs that exist now (what a deactivate removes). */
  present: SkillAgentPair[];
  /** Pairs that are absent (what an activate adds). */
  missing: SkillAgentPair[];
}

/**
 * Work out whether a preset is fully, partly or not deployed in a scope.
 * agent-pair: every skill × agent pair counts on its own.
 * logical-skill: a skill counts only when every agent has it (project scope).
 */
export function computePresetState(
  preset: Preset,
  knownSkillIds: ReadonlySet<string>,
  agentKeys: readonly string[],
  exists: (skillId: string, agentKey: string) => boolean,
  mode: PresetBarMode,
): PresetState {
  const skillIds = preset.skillIds.filter((id) => knownSkillIds.has(id));
  const present: SkillAgentPair[] = [];
  const missing: SkillAgentPair[] = [];
  if (skillIds.length === 0 || agentKeys.length === 0) {
    return { activity: "empty", installed: 0, total: 0, present, missing };
  }

  let completeSkills = 0;
  for (const skillId of skillIds) {
    let complete = true;
    for (const agentKey of agentKeys) {
      if (exists(skillId, agentKey)) present.push({ skillId, agentKey });
      else {
        missing.push({ skillId, agentKey });
        complete = false;
      }
    }
    if (complete) completeSkills += 1;
  }

  const total = mode === "agent-pair" ? skillIds.length * agentKeys.length : skillIds.length;
  const installed = mode === "agent-pair" ? present.length : completeSkills;
  let activity: PresetActivity = "partial";
  if (missing.length === 0) activity = "active";
  else if (present.length === 0) activity = "inactive";
  return { activity, installed, total, present, missing };
}
