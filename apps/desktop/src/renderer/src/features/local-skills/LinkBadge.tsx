import type { LocalSkill } from "@loadout/shared";
import { Copy, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";
import { cn } from "@/lib/utils";

type LinkKind = "linked" | "copy" | "link";

/** Linked into the library, a managed copy, or a link someone else made. Plain folders: none. */
function kindOf(skill: Pick<LocalSkill, "managed" | "linkTarget">): LinkKind | null {
  if (skill.managed) return skill.linkTarget ? "linked" : "copy";
  return skill.linkTarget ? "link" : null;
}

/**
 * How a skill sits in an agent's folder, so it is clear whether an edit in one place shows up in
 * the other: a link is the same folder, a copy is not until it is refreshed.
 */
export function LinkBadge({
  skill,
}: {
  skill: Pick<LocalSkill, "managed" | "linkTarget">;
}): ReactNode {
  const { t } = useTranslation();
  const { data: info } = useAppInfo();
  const kind = kindOf(skill);
  if (!kind) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Above the card's stretched click area, or the tooltip would never open. */}
        <span className={cn(SKILL_ITEM_RAISED_CLASS, "inline-flex")}>
          <StatusBadge
            tone={kind === "copy" ? "neutral" : "primary"}
            icon={kind === "copy" ? <Copy /> : <Link2 />}
            label={t(`localSkills.link.${kind}.label`)}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <p>{t(`localSkills.link.${kind}.hint`)}</p>
        {skill.linkTarget ? (
          <p className="font-mono break-all opacity-80">
            {compactHome(skill.linkTarget, info?.homeDir)}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
