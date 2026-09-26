import {
  SAFETY_SEVERITIES,
  type SafetyFinding,
  type SafetyReport,
  type SafetySeverity,
  type SafetyVerdict,
  formatRelative,
} from "@loadout/shared";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export const VERDICT_TONES: Record<SafetyVerdict, StatusTone> = {
  safe: "success",
  caution: "warning",
  unsafe: "danger",
};
export const VERDICT_ICONS = {
  safe: ShieldCheck,
  caution: ShieldQuestion,
  unsafe: ShieldAlert,
} as const;
const SEVERITY_TONES: Record<SafetySeverity, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

/** "Flagged", "Review", "Passed": one chip for a verdict. */
export function SafetyVerdictBadge({
  verdict,
  compact,
  stale,
}: {
  verdict: SafetyVerdict;
  compact?: boolean;
  /** The skill changed since the scan: said in the label, and the chip goes quiet. */
  stale?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const Icon = VERDICT_ICONS[verdict];
  const label = t(`safety.verdict.${verdict}`);
  return (
    <StatusBadge
      tone={stale ? "neutral" : VERDICT_TONES[verdict]}
      icon={<Icon />}
      label={stale ? t("safety.staleLabel", { verdict: label }) : label}
      compact={compact}
    />
  );
}

/** Each finding with a stable key: its rule and place, plus a count for exact repeats. */
function keyedFindings(
  findings: readonly SafetyFinding[],
): { key: string; finding: SafetyFinding }[] {
  const seen = new Map<string, number>();
  return findings.map((finding) => {
    const place = `${finding.id}:${finding.file}:${finding.line}`;
    const repeat = seen.get(place) ?? 0;
    seen.set(place, repeat + 1);
    return { key: `${place}:${repeat}`, finding };
  });
}

function FindingItem({ finding }: { finding: SafetyFinding }): ReactNode {
  const { t } = useTranslation();
  const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  return (
    <li className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge
          tone={SEVERITY_TONES[finding.severity]}
          label={t(`safety.severity.${finding.severity}`)}
        />
        <span className="text-sm font-medium">
          {[finding.category, finding.pattern].filter(Boolean).join(" · ")}
        </span>
        {where ? (
          <span className="ml-auto font-mono text-xs text-muted-foreground">{where}</span>
        ) : null}
      </div>
      {finding.excerpt ? (
        <code
          data-selectable
          className="block truncate rounded-md bg-muted px-2 py-1 font-mono text-xs"
          title={finding.excerpt}
        >
          {finding.excerpt}
        </code>
      ) : null}
      {finding.explanation ? (
        <p className="text-xs text-muted-foreground">{finding.explanation}</p>
      ) : null}
    </li>
  );
}

/**
 * What the safety scanner said about one skill: verdict, score, how many findings of each
 * severity, then the findings themselves, worst first.
 */
export function SafetyReportView({
  report,
  stale,
  className,
}: {
  report: SafetyReport;
  stale?: boolean;
  className?: string;
}): ReactNode {
  const { t } = useTranslation();
  const counted = SAFETY_SEVERITIES.filter((severity) => report.counts[severity] > 0);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SafetyVerdictBadge verdict={report.verdict} stale={stale} />
        <span className="text-sm tabular-nums">{t("safety.score", { score: report.score })}</span>
        {counted.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {counted
              .map((severity) =>
                t(`safety.countOf.${severity}`, { count: report.counts[severity] }),
              )
              .join(" · ")}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {t("safety.scannedAt", {
            when: formatRelative(report.scannedAt),
            version: report.scannerVersion ?? "?",
          })}
        </span>
      </div>
      {stale ? <p className="text-xs text-muted-foreground">{t("safety.staleHint")}</p> : null}
      {report.findings.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {keyedFindings(report.findings).map(({ key, finding }) => (
            <FindingItem key={key} finding={finding} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("safety.noFindings")}</p>
      )}
    </div>
  );
}
