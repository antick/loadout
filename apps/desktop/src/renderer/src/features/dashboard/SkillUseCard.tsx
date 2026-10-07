import { type Skill, USAGE_RECENT_DAYS, formatRelative, isUnusedSkill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { Activity, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { UsageReadStatus } from "@/components/UsageReadStatus";
import { useSetUsageTracking } from "@/hooks/mutations/usage";
import { useSkillUsage } from "@/hooks/queries/usage";
import { TOP_USED_SKILLS_LIMIT } from "./constants";

const ROW_CLASS =
  "flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset";

/** Offer to count skill use, with what it reads and keeps. */
function TurnOnCard(): ReactNode {
  const { t } = useTranslation();
  const setTracking = useSetUsageTracking();
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3.5">
      <Activity className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("usage.card.offTitle")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("usage.card.offBody")}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={setTracking.isPending}
        onClick={() => setTracking.mutate(true)}
      >
        {setTracking.isPending ? <Spinner /> : null}
        {t("usage.card.turnOn")}
      </Button>
    </div>
  );
}

/** The skills agents ran most in the last days, and how many they did not run at all. */
export function SkillUseCard({ skills }: { skills: readonly Skill[] }): ReactNode {
  const { t } = useTranslation();
  const usage = useSkillUsage();
  if (!usage.report) return null;
  if (!usage.enabled) {
    return (
      <PageSection title={t("usage.card.title")}>
        <TurnOnCard />
      </PageSection>
    );
  }

  const top = skills
    .map((skill) => ({ skill, used: usage.byId.get(skill.id) }))
    .filter(({ used }) => (used?.recentUses ?? 0) > 0)
    .sort((a, b) => (b.used?.recentUses ?? 0) - (a.used?.recentUses ?? 0))
    .slice(0, TOP_USED_SKILLS_LIMIT);
  const unused = skills.filter((skill) => isUnusedSkill(skill, usage)).length;

  return (
    <PageSection title={t("usage.card.title")} actions={<UsageReadStatus usage={usage} />}>
      <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
        {top.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">
            {usage.scanning
              ? t("usage.reading")
              : t("usage.card.empty", { days: USAGE_RECENT_DAYS })}
          </li>
        ) : null}
        {top.map(({ skill, used }) => (
          <li key={skill.id}>
            <Link to="/library" search={{ skill: skill.id }} className={ROW_CLASS}>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{skill.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t("usage.card.recent", { count: used?.recentUses ?? 0, days: USAGE_RECENT_DAYS })}
              </span>
              <time className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {used ? formatRelative(used.lastUsedAt) : ""}
              </time>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
        {unused > 0 ? (
          <li>
            <Link to="/library" search={{ status: "unused" }} className={ROW_CLASS}>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {t("usage.card.unused", { count: unused, days: USAGE_RECENT_DAYS })}
              </span>
              <span className="text-xs font-medium">{t("usage.card.viewUnused")}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ) : null}
      </ul>
    </PageSection>
  );
}
