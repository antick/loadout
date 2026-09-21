import type { FileDiffEntry, FileDiffKind, FileDiffStatus } from "@loadout/shared";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DiffStat, DiffView } from "@/components/DiffView";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { computeLineDiff } from "@/lib/diff";

const STATUS_TONES: Record<FileDiffStatus, StatusTone> = {
  added: "success",
  removed: "danger",
  modified: "warning",
};

/** Entries opened by default; more than this and the list starts collapsed to stay scannable. */
const AUTO_EXPAND_LIMIT = 3;

function FileDiffItem({
  entry,
  defaultOpen,
}: {
  entry: FileDiffEntry;
  defaultOpen: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const isText = entry.kind === "text";
  const stat = useMemo(
    () => (isText ? computeLineDiff(entry.before ?? "", entry.after ?? "") : null),
    [isText, entry.before, entry.after],
  );
  const summaries: Record<Exclude<FileDiffKind, "text">, string> = {
    binary: t("diff.binary"),
    too_large: t("diff.tooLarge"),
    permission_only: t(entry.executableAfter ? "diff.madeExecutable" : "diff.madeNotExecutable"),
  };

  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group/file flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/file:rotate-90" />
        <span data-selectable className="min-w-0 flex-1 truncate font-mono text-xs">
          {entry.path}
        </span>
        {stat ? <DiffStat added={stat.added} removed={stat.removed} /> : null}
        <StatusBadge tone={STATUS_TONES[entry.status]} label={t(`diff.status.${entry.status}`)} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-2">
        {entry.kind === "text" ? (
          <DiffView before={entry.before ?? ""} after={entry.after ?? ""} className="border-0" />
        ) : (
          <p className="px-1 py-2 text-sm text-muted-foreground">{summaries[entry.kind]}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** File-by-file comparison: one collapsible per file with its status and a line diff or a summary. */
export function FileDiffList({ entries }: { entries: readonly FileDiffEntry[] }): ReactNode {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        {t("diff.noChanges")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <FileDiffItem
          key={entry.path}
          entry={entry}
          defaultOpen={entries.length <= AUTO_EXPAND_LIMIT}
        />
      ))}
    </div>
  );
}
