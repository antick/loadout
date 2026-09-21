import { MARKETPLACE_NAME, type MarketSkill, formatCount } from "@loadout/shared";
import { Check, Download, ExternalLink, RefreshCw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type InstallTask, installPhaseText } from "@/features/install/install-tasks";

export interface MarketSkillCardProps {
  skill: MarketSkill;
  /** The running install of this skill, when there is one. */
  task?: InstallTask;
  onInstall: (skill: MarketSkill) => void;
  onCancel: (skill: MarketSkill) => void;
  onViewOnWeb: (skill: MarketSkill) => void;
  /** Narrow the list to this skill's contributor. */
  onFilterSource: (source: string) => void;
}

/** One marketplace result: name, contributor, install count, and the install action. */
export function MarketSkillCard({
  skill,
  task,
  onInstall,
  onCancel,
  onViewOnWeb,
  onFilterSource,
}: MarketSkillCardProps): ReactNode {
  const { t } = useTranslation();

  return (
    <article className="flex min-h-28 flex-col gap-1.5 rounded-lg border bg-card p-3 transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={skill.name}>
          {skill.name}
        </h3>
        {skill.installed ? (
          <StatusBadge tone="success" label={t("install.market.inLibrary")} icon={<Check />} />
        ) : null}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onFilterSource(skill.source)}
            className="-mx-1 w-fit max-w-full truncate rounded px-1 text-left font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {skill.source}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("install.market.onlyThisSource")}</TooltipContent>
      </Tooltip>

      <div className="mt-auto flex items-center gap-1 pt-1.5">
        <span
          className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground tabular-nums"
          title={t("install.market.installs", { count: skill.installs })}
        >
          <Download className="size-3 shrink-0" />
          <span className="truncate">
            {task ? installPhaseText(task.progress) : formatCount(skill.installs)}
          </span>
        </span>
        <IconButton
          label={t("install.market.viewOnWeb", { marketplace: MARKETPLACE_NAME })}
          icon={<ExternalLink />}
          onClick={() => onViewOnWeb(skill)}
        />
        {task ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!task.cancellable || task.cancelling}
            onClick={() => onCancel(skill)}
          >
            {task.cancelling ? <Spinner /> : <X />}
            {t("common.cancel")}
          </Button>
        ) : (
          <Button
            variant={skill.installed ? "outline" : "default"}
            size="sm"
            onClick={() => onInstall(skill)}
          >
            {skill.installed ? <RefreshCw /> : <Download />}
            {t(skill.installed ? "install.market.reinstall" : "install.market.install")}
          </Button>
        )}
      </div>
    </article>
  );
}
