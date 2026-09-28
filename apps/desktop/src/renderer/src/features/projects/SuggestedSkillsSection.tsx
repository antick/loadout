import type { Project, Skill, SkillSuggestion } from "@loadout/shared";
import { Plus, Sparkles, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { useSetSuggestionDismissed } from "@/hooks/mutations/project-suggestions";
import { useProjectSkillSuggestions } from "@/hooks/queries/project-suggestions";
import { useSkills } from "@/hooks/queries/skills";
import { cn } from "@/lib/utils";
import { suggestionText } from "./suggestion-text";

/** Rows shown before "Show all". */
const COLLAPSED_ROWS = 3;

export interface SuggestedSkillsSectionProps {
  project: Project;
  /** Open the add-skills sheet with these skills ticked, noting why each is suggested. */
  onAdd: (skillIds: string[], notes: ReadonlyMap<string, string>) => void;
}

/**
 * Library skills that fit the project, from its files: one click opens the usual add sheet with
 * them ticked, and a skill that is not for this project can be sent away (and brought back).
 */
export function SuggestedSkillsSection({ project, onAdd }: SuggestedSkillsSectionProps): ReactNode {
  const { t } = useTranslation();
  const suggestions = useProjectSkillSuggestions(project.id);
  const library = useSkills();
  const dismiss = useSetSuggestionDismissed();
  const [expanded, setExpanded] = useState(false);

  const byId = useMemo(
    () => new Map<string, Skill>((library.data ?? []).map((skill) => [skill.id, skill])),
    [library.data],
  );
  const rows = useMemo(
    () =>
      (suggestions.data?.suggestions ?? []).flatMap((suggestion) => {
        const skill = byId.get(suggestion.skillId);
        return skill ? [{ skill, suggestion, why: suggestionText(t, suggestion) }] : [];
      }),
    [suggestions.data, byId, t],
  );
  const notes = useMemo(() => new Map(rows.map((row) => [row.skill.id, row.why])), [rows]);
  const dismissed = suggestions.data?.dismissed ?? [];
  if (rows.length === 0 && dismissed.length === 0) return null;

  const strongIds = rows
    .filter((row) => row.suggestion.strength === "strong")
    .map((row) => row.skill.id);
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const technologies = suggestions.data?.technologies ?? [];
  const setDismissed = (skillIds: readonly string[], value: boolean): void =>
    dismiss.mutate({ projectId: project.id, skillIds, dismissed: value });

  return (
    <PageSection
      title={t("projectPage.suggestedSkills.title")}
      description={
        technologies.length > 0
          ? t("projectPage.suggestedSkills.uses", { list: technologies.join(", ") })
          : undefined
      }
      actions={
        strongIds.length > 1 ? (
          <Button variant="outline" size="sm" onClick={() => onAdd(strongIds, notes)}>
            <Plus />
            {t("projectPage.suggestedSkills.addAll", { count: strongIds.length })}
          </Button>
        ) : null
      }
    >
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
          {shown.map(({ skill, suggestion, why }) => (
            <SuggestionRow
              key={skill.id}
              skill={skill}
              suggestion={suggestion}
              why={why}
              onAdd={() => onAdd([skill.id], notes)}
              onDismiss={() => setDismissed([skill.id], true)}
            />
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {rows.length > COLLAPSED_ROWS ? (
          <Button variant="ghost" size="xs" onClick={() => setExpanded((open) => !open)}>
            {expanded
              ? t("projectPage.suggestedSkills.showFewer")
              : t("projectPage.suggestedSkills.showAll", { count: rows.length })}
          </Button>
        ) : null}
        {dismissed.length > 0 ? (
          <span className="flex items-center gap-1">
            {t("projectPage.suggestedSkills.hidden", { count: dismissed.length })}
            <Button
              variant="ghost"
              size="xs"
              disabled={dismiss.isPending}
              onClick={() => setDismissed(dismissed, false)}
            >
              {t("projectPage.suggestedSkills.showAgain")}
            </Button>
          </span>
        ) : null}
      </div>
    </PageSection>
  );
}

function SuggestionRow({
  skill,
  suggestion,
  why,
  onAdd,
  onDismiss,
}: {
  skill: Skill;
  suggestion: SkillSuggestion;
  why: string;
  onAdd: () => void;
  onDismiss: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const weak = suggestion.strength === "weak";
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Sparkles
        className={cn("size-4 shrink-0", weak ? "text-muted-foreground" : "text-primary")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{skill.name}</p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={skill.description ?? undefined}
        >
          {weak ? t("projectPage.suggestedSkills.maybe", { why }) : why}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus />
        {t("projectPage.suggestedSkills.add")}
      </Button>
      <IconButton
        label={t("projectPage.suggestedSkills.dismiss", { name: skill.name })}
        icon={<X />}
        onClick={onDismiss}
      />
    </li>
  );
}
