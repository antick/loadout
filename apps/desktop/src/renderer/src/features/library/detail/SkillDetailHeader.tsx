import type { Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SkillIndicators } from "@/components/SkillIndicators";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SkillTagsEditor } from "@/features/library/detail/SkillTagsEditor";
import { SkillUsageSummary } from "@/features/library/detail/SkillUsageSummary";
import { useLibrarySkillActions } from "@/features/library/use-library-skill-actions";
import { SkillActionMenu } from "@/features/local-skills/SkillActionMenu";
import { editLink } from "@/lib/skill-location";

/** Menu entries the header already shows as buttons of their own. */
const HEADER_BUTTON_ACTIONS = new Set(["edit", "favorite"]);

export interface SkillDetailHeaderProps {
  skill: Skill;
  /** Delete from the panel, which also closes it. */
  onDelete: () => void;
}

/**
 * Top of the detail panel: name, description, source and update badges, tags, the edit and
 * favourite buttons, and the rest of the skill's actions (the same as its right-click menu).
 */
export function SkillDetailHeader({ skill, onDelete }: SkillDetailHeaderProps): ReactNode {
  const { t } = useTranslation();
  // The panel's own delete also closes it.
  const actionsFor = useLibrarySkillActions({ onDelete });
  const actions = actionsFor(skill).filter((action) => !HEADER_BUTTON_ACTIONS.has(action.id));

  return (
    <SheetHeader className="gap-3 border-b px-6 pt-5 pb-4">
      {/* The sheet's own close button sits top right; keep clear of it. */}
      <div className="flex items-start gap-3 pr-8">
        <div className="min-w-0 flex-1">
          <SheetTitle data-selectable className="truncate text-xl tracking-tight">
            {skill.name}
          </SheetTitle>
          <SheetDescription data-selectable className="mt-1 line-clamp-3">
            {skill.description ?? t("skills.noDescription")}
          </SheetDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="outline" size="sm" className="mr-1">
            <Link {...editLink({ kind: "library", skillId: skill.id })}>
              <PencilLine />
              {t("editor.open")}
            </Link>
          </Button>
          <FavoriteButton skill={skill} size="icon-sm" />
          <SkillActionMenu actions={actions} name={skill.name} size="icon-sm" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SourceBadge skill={skill} />
        <SkillIndicators skill={skill} showAll />
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        <SkillTagsEditor skill={skill} />
      </div>
      <SkillUsageSummary skillId={skill.id} />
    </SheetHeader>
  );
}
