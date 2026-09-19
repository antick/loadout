import type { AgentInfo, Skill } from "@skillboard/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRight, EllipsisVertical, GripVertical, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentBadgeRow } from "@/components/AgentBadgeRow";
import { IconButton } from "@/components/IconButton";
import { SkillIndicators } from "@/components/SkillIndicators";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PresetSkillToggles } from "@/features/presets/PresetSkillToggles";

export interface PresetSkillRowProps {
  presetId: string;
  skill: Skill;
  /** Available agents, for the "where is it deployed now" summary. */
  agents: readonly AgentInfo[];
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}

/** One member of a preset: drag to reorder, expand for the per-agent switches of this preset. */
export function PresetSkillRow({
  presetId,
  skill,
  agents,
  position,
  isFirst,
  isLast,
  onMove,
  onRemove,
}: PresetSkillRowProps): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const deployedKeys = useMemo(
    () => new Set(skill.deployments.map((entry) => entry.agentKey)),
    [skill.deployments],
  );
  const deployedCount = agents.filter((agent) => deployedKeys.has(agent.key)).length;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-card transition-colors duration-150 hover:border-primary/40"
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <GripVertical
          aria-hidden="true"
          className="size-4 shrink-0 cursor-grab text-muted-foreground/60"
        />
        <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/library"
              search={{ skill: skill.id }}
              className="truncate rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {skill.name}
            </Link>
            <SkillIndicators skill={skill} compact />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {skill.description ?? t("skills.noDescription")}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <AgentBadgeRow agents={agents} deployedKeys={deployedKeys} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("presetPage.deployedSummary", { deployed: deployedCount, total: agents.length })}
          </span>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="group/toggles shrink-0">
            <ChevronRight className="transition-transform duration-150 group-data-[state=open]/toggles:rotate-90" />
            {t("presetPage.toggles.button")}
          </Button>
        </CollapsibleTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              label={t("presetPage.rowMenu", { name: skill.name })}
              icon={<EllipsisVertical />}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
              {t("common.moveUp")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
              {t("common.moveDown")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton
          label={t("presetPage.removeSkill")}
          icon={<X />}
          className="text-muted-foreground hover:text-danger"
          onClick={onRemove}
        />
      </div>
      <CollapsibleContent className="border-t px-4 py-3">
        <PresetSkillToggles presetId={presetId} skillId={skill.id} />
      </CollapsibleContent>
    </Collapsible>
  );
}
