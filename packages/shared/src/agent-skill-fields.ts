import { MANUAL_ONLY_KEY, isManualOnlyValue } from "./manual-only";
import { isFilled } from "./skill-traits";

/**
 * Frontmatter fields, besides `name` and `description`, that change how an agent treats a skill.
 * Some agents read them; others skip them without a word, and the skill then behaves differently
 * there (a "manual only" skill that the model may still start by itself).
 */
export const SKILL_BEHAVIOUR_FIELDS = [
  "allowed-tools",
  "disallowed-tools",
  MANUAL_ONLY_KEY,
  "user-invocable",
  "model",
  "effort",
  "context",
  "agent",
  "hooks",
  "argument-hint",
  "paths",
  "shell",
] as const;
export type SkillBehaviourField = (typeof SKILL_BEHAVIOUR_FIELDS)[number];

/**
 * How sure the docs make us that an agent skips a field it does not list.
 * `complete`: the docs list every field and say the rest are ignored.
 * `table`: the docs have a table of fields but never say it is complete.
 */
export type FieldKnowledgeBasis = "complete" | "table";

export interface AgentFieldKnowledge {
  basis: FieldKnowledgeBasis;
  /** The behaviour fields the agent's own documentation describes for skills. */
  reads: readonly SkillBehaviourField[];
  /** Where that was read. */
  source: string;
}

/**
 * What each agent's official documentation says about frontmatter, by agent key. An agent is here
 * only when its docs give a table of fields; for the rest Loadout says nothing, since not being
 * documented is not the same as being ignored. Check the source before changing an entry.
 */
export const AGENT_FIELD_KNOWLEDGE: Readonly<Record<string, AgentFieldKnowledge>> = {
  claude_code: {
    basis: "complete",
    reads: SKILL_BEHAVIOUR_FIELDS,
    source: "https://code.claude.com/docs/en/skills",
  },
  opencode: {
    basis: "complete",
    reads: [],
    source: "https://opencode.ai/docs/skills/",
  },
  cursor: {
    basis: "table",
    reads: [MANUAL_ONLY_KEY, "paths"],
    source: "https://cursor.com/docs/context/skills",
  },
};

/** `ignored`: the agent's docs say it skips the field. `undocumented`: its docs do not list it. */
export type FieldNoteLevel = "ignored" | "undocumented";

export interface AgentFieldNote {
  field: SkillBehaviourField;
  level: FieldNoteLevel;
}

/** A value that changes what the field asks for: `disable-model-invocation: false` asks for nothing. */
function asksForSomething(field: SkillBehaviourField, value: unknown): boolean {
  if (field === MANUAL_ONLY_KEY) return isManualOnlyValue(value);
  if (field === "user-invocable")
    return value === false || String(value).trim().toLowerCase() === "false";
  return isFilled(value);
}

/** The behaviour fields a parsed frontmatter really uses, in the order of `SKILL_BEHAVIOUR_FIELDS`. */
export function behaviourFieldsIn(data: Readonly<Record<string, unknown>>): SkillBehaviourField[] {
  return SKILL_BEHAVIOUR_FIELDS.filter((field) => asksForSomething(field, data[field]));
}

/**
 * The fields of a skill that an agent will not act on, as far as its documentation says. Empty for
 * an agent Loadout has no documentation for.
 */
export function fieldNotesFor(fields: readonly string[], agentKey: string): AgentFieldNote[] {
  const knowledge = AGENT_FIELD_KNOWLEDGE[agentKey];
  if (!knowledge) return [];
  const level: FieldNoteLevel = knowledge.basis === "complete" ? "ignored" : "undocumented";
  return SKILL_BEHAVIOUR_FIELDS.filter(
    (field) => fields.includes(field) && !knowledge.reads.includes(field),
  ).map((field) => ({ field, level }));
}
