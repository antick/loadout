import { MARKETPLACE_NAME, type SourceCandidate } from "@loadout/shared";
import { GitBranch, Store } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { CANDIDATE_FILES_SHOWN, evidenceKey, matchLabel, matchTone } from "./source-candidate";

export interface SourceCandidateItemProps {
  candidate: SourceCandidate;
  /** Buttons on the right, such as Link. */
  actions?: ReactNode;
  /** One line only: the batch list shows many at once. */
  compact?: boolean;
  className?: string;
}

/**
 * One repository a skill may have come from: where the skill is in it, why it was suggested, and
 * how the library copy compares, with the files that differ.
 */
export function SourceCandidateItem({
  candidate,
  actions,
  compact,
  className,
}: SourceCandidateItemProps): ReactNode {
  const { t } = useTranslation();
  const Icon = candidate.marketRef ? Store : GitBranch;
  const label = matchLabel(candidate);
  const path = candidate.subpath ?? t("origin.root");
  const where = candidate.branch
    ? t("origin.at", { path, branch: candidate.branch })
    : t("origin.atDefault", { path });
  const shown = candidate.changedFiles.slice(0, CANDIDATE_FILES_SHOWN);
  const hidden = candidate.changedFiles.length - shown.length;

  return (
    <div className={cn("flex items-start gap-3 text-sm", className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span data-selectable className="truncate font-medium" title={candidate.url}>
            {candidate.label}
          </span>
          <StatusBadge tone={matchTone(candidate)} label={t(label.key, label.values)} />
        </div>
        <p className="text-xs text-muted-foreground">
          <span data-selectable className="font-mono">
            {where}
          </span>
          {compact ? null : (
            <>
              {" · "}
              {t(evidenceKey(candidate.evidence), { marketplace: MARKETPLACE_NAME })}
            </>
          )}
        </p>
        {!compact && shown.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-foreground/80">
            {shown.map((file) => (
              <li key={file} data-selectable>
                {file}
              </li>
            ))}
            {hidden > 0 ? (
              <li className="font-sans text-muted-foreground">
                {t("common.andMore", { count: hidden })}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}
