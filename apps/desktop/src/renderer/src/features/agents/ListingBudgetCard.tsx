import {
  LISTING_WINDOW_CHOICES,
  type ListingEntry,
  type ListingWindow,
  type SkillListingReport,
  biggestListed,
  formatNumber,
} from "@loadout/shared";
import { ChevronDown, Gauge, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { OptionSelect } from "@/components/OptionSelect";
import { PageSection } from "@/components/PageSection";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useSetSetting } from "@/hooks/mutations/settings";
import { LISTING_SKILLS_SHOWN, PERCENT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ShowMoreButton } from "@/components/ShowMoreButton";

export interface ListingBudgetCardProps {
  report: SkillListingReport;
}

/** Share of the budget used, 0 to 100 (more is capped for the bar). */
function percentUsed(report: SkillListingReport): number {
  return report.budget > 0 ? Math.round((report.used / report.budget) * PERCENT) : 0;
}

function EntryRow({ entry, agentName }: { entry: ListingEntry; agentName: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <span data-selectable className="min-w-0 truncate font-medium">
        {entry.name}
      </span>
      {entry.plugin ? <StatusBadge tone="neutral" label={entry.plugin} /> : null}
      {entry.mode === "name_only" ? (
        <StatusBadge tone="neutral" label={t("listing.nameOnly")} />
      ) : null}
      {entry.cut ? (
        <span title={t("listing.cutHint", { agent: agentName })}>
          <StatusBadge tone="warning" label={t("listing.cut")} />
        </span>
      ) : null}
      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatNumber(entry.chars)}
      </span>
    </li>
  );
}

/**
 * What an agent's skill listing costs against its budget, with the skills that cost the most.
 * Open by itself when the listing is over budget; a one-line summary while it fits.
 */
export function ListingBudgetCard({ report }: ListingBudgetCardProps): ReactNode {
  const { t } = useTranslation();
  const setSetting = useSetSetting();
  const over = report.over > 0;
  // Until the person opens or closes it, it is open exactly while the listing is over budget.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? over;
  const [showAll, setShowAll] = useState(false);
  const agent = report.agentName;
  const listed = report.entries.filter((entry) => entry.chars > 0);
  const rows = showAll ? listed : biggestListed(report, LISTING_SKILLS_SHOWN);
  const more = listed.length - LISTING_SKILLS_SHOWN;

  return (
    <PageSection title={t("listing.title")} description={t("listing.description", { agent })}>
      <Collapsible open={open} onOpenChange={setChosen}>
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border bg-card p-4",
            over && "border-warning/40",
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {over ? (
              <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
            ) : (
              <Gauge className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <p className="text-sm font-medium tabular-nums">
              {t("listing.usage", {
                used: formatNumber(report.used),
                budget: formatNumber(report.budget),
              })}
            </p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("listing.percent", { percent: percentUsed(report) })}
            </span>
            <CollapsibleTrigger asChild>
              <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground">
                {open ? t("listing.hideDetails") : t("listing.details")}
                <ChevronDown
                  className={cn(
                    "transition-transform motion-reduce:transition-none",
                    open && "rotate-180",
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <Progress
            value={Math.min(100, percentUsed(report))}
            aria-label={t("listing.title")}
            className={cn(over && "bg-warning/20 *:data-[slot=progress-indicator]:bg-warning")}
          />
          <CollapsibleContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("listing.counts", {
                full: report.full,
                nameOnly: report.nameOnly,
                hidden: report.hidden,
              })}
            </p>
            {over ? (
              <InlineNotice tone="warning" icon={TriangleAlert}>
                {t("listing.over", { over: formatNumber(report.over), agent })}
              </InlineNotice>
            ) : (
              <p className="text-sm text-muted-foreground">{t("listing.fits", { agent })}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{t(`listing.source.${report.budgetSource}`, { agent })}</span>
              {report.budgetSource === "characters" ? null : (
                <label className="flex items-center gap-2">
                  {t("listing.window")}
                  <OptionSelect<ListingWindow>
                    value={report.window}
                    options={LISTING_WINDOW_CHOICES}
                    labelOf={(choice) => t(`listing.windowChoice.${choice}`)}
                    onChange={(value) => setSetting.mutate({ key: "skillListingWindow", value })}
                    ariaLabel={t("listing.window")}
                  />
                </label>
              )}
            </div>
            {report.budgetSource === "characters" ? null : (
              <p className="text-xs text-muted-foreground">{t("listing.windowHint")}</p>
            )}
            {rows.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {t("listing.biggest")}
                </h3>
                <ul className="flex flex-col divide-y rounded-lg border bg-background">
                  {rows.map((entry) => (
                    <EntryRow key={entry.path} entry={entry} agentName={agent} />
                  ))}
                </ul>
                <ShowMoreButton
                  expanded={showAll}
                  hidden={more}
                  onToggle={() => setShowAll((all) => !all)}
                  moreLabel={t("listing.showAll", { count: listed.length })}
                />
              </div>
            ) : null}
          </CollapsibleContent>
        </div>
      </Collapsible>
    </PageSection>
  );
}
