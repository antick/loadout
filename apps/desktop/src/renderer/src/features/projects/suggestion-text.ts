import type { SkillSuggestion, SuggestionReason } from "@loadout/shared";
import type { TFunction } from "i18next";

/** "For React", "Has Cargo.toml", "Mentions Docker": why one skill fits. */
export function reasonText(t: TFunction, reason: SuggestionReason): string {
  if (reason.kind === "pattern") {
    return reason.pattern === reason.match
      ? t("projectPage.suggestedSkills.reason.has", { path: reason.match })
      : t("projectPage.suggestedSkills.reason.matches", {
          path: reason.match,
          pattern: reason.pattern,
        });
  }
  return t(
    reason.where === "description"
      ? "projectPage.suggestedSkills.reason.mentions"
      : "projectPage.suggestedSkills.reason.for",
    { tech: reason.tech },
  );
}

/** Every reason of a suggestion, joined. */
export function suggestionText(t: TFunction, suggestion: SkillSuggestion): string {
  return suggestion.reasons.map((reason) => reasonText(t, reason)).join(" · ");
}
