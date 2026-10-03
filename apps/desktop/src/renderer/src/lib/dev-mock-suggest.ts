/**
 * DEV ONLY. Skill suggestions for the browser preview: every project "uses" React, TypeScript
 * and Docker, so skills naming them are suggested, plus any skill with a pattern.
 */
import type { DataScope, ProjectSuggestions, Skill } from "@loadout/shared";
import { cleanSuggestPatterns } from "@loadout/shared";
import type { MockHandlers } from "@/lib/dev-mock-types";

const TECHNOLOGIES = ["TypeScript", "JavaScript", "React", "Docker"];
const WORDS: Record<string, string> = {
  react: "React",
  docker: "Docker",
  typescript: "TypeScript",
};

export function createSuggestMockHandlers(
  skills: { get: () => Skill[]; set: (next: Skill[]) => void },
  emitChanged: (...scope: DataScope[]) => void,
): MockHandlers {
  const getSkills = skills.get;
  const dismissed = new Map<string, Set<string>>();
  const hiddenIn = (projectId: string): Set<string> => {
    const set = dismissed.get(projectId) ?? new Set<string>();
    dismissed.set(projectId, set);
    return set;
  };

  function suggest(projectId: string): ProjectSuggestions {
    const hidden = hiddenIn(projectId);
    const suggestions = getSkills().flatMap((skill): ProjectSuggestions["suggestions"] => {
      if (hidden.has(skill.id)) return [];
      const text = `${skill.name} ${skill.tags.join(" ")} ${skill.description ?? ""}`.toLowerCase();
      const reasons: ProjectSuggestions["suggestions"][number]["reasons"] = [
        ...skill.suggestFor.map((pattern) => ({
          kind: "pattern" as const,
          pattern,
          match: "package.json",
        })),
        ...Object.entries(WORDS)
          .filter(([word]) => text.includes(word))
          .map(([word, tech]) => ({
            kind: "tech" as const,
            tech,
            where: skill.name.includes(word) ? ("name" as const) : ("description" as const),
          })),
      ];
      if (reasons.length === 0) return [];
      const strong = reasons.some((r) => r.kind === "pattern" || r.where === "name");
      return [{ skillId: skill.id, strength: strong ? "strong" : "weak", reasons }];
    });
    return { technologies: TECHNOLOGIES, suggestions, dismissed: [...hidden] };
  }

  return {
    "projects.suggestSkills": (projectId: string) => suggest(projectId),
    "projects.setSuggestionDismissed": (projectId: string, skillId: string, value: boolean) => {
      const hidden = hiddenIn(projectId);
      if (value) hidden.add(skillId);
      else hidden.delete(skillId);
    },
    "skills.setSuggestFor": (skillId: string, patterns: string[]) => {
      const suggestFor = cleanSuggestPatterns(patterns);
      skills.set(
        getSkills().map((skill) => (skill.id === skillId ? { ...skill, suggestFor } : skill)),
      );
      emitChanged("skills");
      const updated = getSkills().find((skill) => skill.id === skillId);
      if (!updated) throw new Error(`There is no skill "${skillId}".`);
      return updated;
    },
  };
}
