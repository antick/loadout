import { parseFrontmatter } from "@/lib/frontmatter";

/**
 * Quick checks of a skill document while it is edited. Agents pick a skill by the `name` and
 * `description` at the top of SKILL.md, so a missing one is worth pointing out before saving.
 */
export type FrontmatterProblem = "missing" | "name" | "description";

const REQUIRED_KEYS = ["name", "description"] as const;

export function frontmatterProblems(content: string): FrontmatterProblem[] {
  const { entries } = parseFrontmatter(content);
  if (entries.length === 0) return ["missing"];
  const filled = new Set(entries.filter((entry) => entry.value.trim()).map((entry) => entry.key));
  // A block scalar (`description: |`) has its text on the following lines.
  const present = new Set(entries.map((entry) => entry.key));
  return REQUIRED_KEYS.filter((key) => !filled.has(key) && !hasBlockValue(content, key, present));
}

function hasBlockValue(content: string, key: string, present: ReadonlySet<string>): boolean {
  if (!present.has(key)) return false;
  return new RegExp(`^${key}:\\s*[|>][+-]?\\s*\\r?\\n[ \\t]+\\S`, "m").test(content);
}
