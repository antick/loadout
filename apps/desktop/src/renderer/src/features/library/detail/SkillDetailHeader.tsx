import type { Skill } from "@loadout/shared";
import { FolderOpen, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { SkillIndicators } from "@/components/SkillIndicators";
import { SourceBadge } from "@/components/SourceBadge";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SkillTagsEditor } from "@/features/library/detail/SkillTagsEditor";
import { useRevealSkill } from "@/hooks/mutations/library";

export interface SkillDetailHeaderProps {
  skill: Skill;
  onDelete: () => void;
}

/** Top of the detail panel: name, description, source and update badges, tags, reveal and delete. */
export function SkillDetailHeader({ skill, onDelete }: SkillDetailHeaderProps): ReactNode {
  const { t } = useTranslation();
  const reveal = useRevealSkill();

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
          <IconButton
            label={t("library.detail.reveal")}
            icon={<FolderOpen />}
            onClick={() => reveal.mutate(skill.id)}
          />
          <IconButton
            label={t("library.detail.delete")}
            icon={<Trash2 />}
            className="text-muted-foreground hover:text-danger"
            onClick={onDelete}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SourceBadge source={skill.sourceType} />
        <SkillIndicators skill={skill} showAll />
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        <SkillTagsEditor skill={skill} />
      </div>
    </SheetHeader>
  );
}
