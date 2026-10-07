import {
  type DuplicatePair,
  type DuplicateReason,
  type Skill,
  formatPercent,
  pairScore,
} from "@loadout/shared";
import { Diff, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { DiffView } from "@/components/DiffView";
import { type StatusTone, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DuplicateSkillSummary } from "@/features/library/duplicates/DuplicateSkillSummary";
import { useSkillDocument } from "@/hooks/queries/skills";

const REASON_TONES: Record<DuplicateReason, StatusTone> = {
  identical: "warning",
  content: "info",
  name: "neutral",
};

export interface DuplicatePairCardProps {
  pair: DuplicatePair;
  a: Skill;
  b: Skill;
  busy: boolean;
  onKeep: (keep: Skill, remove: Skill) => void;
  onDismiss: (pair: DuplicatePair, dismissed: boolean) => void;
}

/** The two `SKILL.md` texts side by side as a line diff, read only when asked for. */
function DocumentComparison({ a, b }: { a: Skill; b: Skill }): ReactNode {
  const first = useSkillDocument(a.id);
  const second = useSkillDocument(b.id);
  if (!first.data || !second.data) return <Skeleton className="h-24 w-full" />;
  return <DiffView before={first.data.content} after={second.data.content} />;
}

/** Two skills that may be one: why they were paired, and what to do about it. */
export function DuplicatePairCard({
  pair,
  a,
  b,
  busy,
  onKeep,
  onDismiss,
}: DuplicatePairCardProps): ReactNode {
  const { t } = useTranslation();
  const [comparing, setComparing] = useState(false);
  const score = formatPercent(pairScore(pair));

  return (
    <article
      aria-label={t("duplicates.pairLabel", { a: a.name, b: b.name })}
      className="flex flex-col gap-3 rounded-lg border bg-card p-3"
    >
      <div className="flex items-center gap-2">
        <StatusBadge
          tone={REASON_TONES[pair.reason]}
          label={t(`duplicates.reason.${pair.reason}`, { score })}
        />
        {pair.dismissed ? (
          <StatusBadge tone="neutral" label={t("duplicates.dismissedBadge")} />
        ) : null}
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <DuplicateSkillSummary skill={a} />
        <DuplicateSkillSummary skill={b} />
      </div>
      {comparing ? <DocumentComparison a={a} b={b} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={comparing}
          onClick={() => setComparing((open) => !open)}
        >
          <Diff />
          {comparing ? t("duplicates.hideCompare") : t("duplicates.compare")}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onKeep(a, b)}>
          {t("duplicates.keep", { name: a.name })}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onKeep(b, a)}>
          {t("duplicates.keep", { name: b.name })}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={() => onDismiss(pair, !pair.dismissed)}
        >
          {pair.dismissed ? <Undo2 /> : null}
          {pair.dismissed ? t("duplicates.listAgain") : t("duplicates.notDuplicate")}
        </Button>
      </div>
    </article>
  );
}
