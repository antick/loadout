import { Equal } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { computeLineDiff, type DiffLineKind } from "@/lib/diff";
import { cn } from "@/lib/utils";

export interface DiffViewProps {
  before: string;
  after: string;
  className?: string;
}

const LINE_CLASSES: Record<DiffLineKind, string> = {
  context: "",
  added: "bg-success/10",
  removed: "bg-danger/10",
};
const GUTTER_CLASSES: Record<DiffLineKind, string> = {
  context: "text-muted-foreground/60",
  added: "text-success",
  removed: "text-danger",
};
const GUTTER_SIGNS: Record<DiffLineKind, string> = { context: " ", added: "+", removed: "-" };
const NUMBER_CELL =
  "w-10 shrink-0 px-1.5 text-right text-muted-foreground/60 tabular-nums select-none";

/** Summary chip "+3 −1" reused by `FileDiffList`. */
export function DiffStat({ added, removed }: { added: number; removed: number }): ReactNode {
  return (
    <span className="inline-flex shrink-0 gap-1.5 font-mono text-xs tabular-nums">
      <span className="text-success">+{added}</span>
      <span className="text-danger">-{removed}</span>
    </span>
  );
}

/** Unified line diff of two texts: hunks with context, both line numbers and +/- gutters. */
export function DiffView({ before, after, className }: DiffViewProps): ReactNode {
  const { t } = useTranslation();
  const diff = useMemo(() => computeLineDiff(before, after), [before, after]);

  if (diff.hunks.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground",
          className,
        )}
      >
        <Equal className="size-4" />
        {t("diff.noChanges")}
      </div>
    );
  }

  return (
    <div
      data-selectable
      className={cn(
        "overflow-x-auto rounded-lg border bg-card font-mono text-xs leading-5",
        className,
      )}
    >
      <div className="min-w-max">
        {diff.hunks.map((hunk) => (
          <div key={hunk.header} className="border-b last:border-b-0">
            <div className="bg-muted/60 px-3 py-0.5 text-muted-foreground select-none">
              {hunk.header}
            </div>
            {hunk.lines.map((line) => (
              <div
                key={`${line.kind}:${line.oldNumber ?? ""}:${line.newNumber ?? ""}`}
                className={cn("flex", LINE_CLASSES[line.kind])}
              >
                <span className={NUMBER_CELL}>{line.oldNumber ?? ""}</span>
                <span className={NUMBER_CELL}>{line.newNumber ?? ""}</span>
                <span
                  className={cn("w-5 shrink-0 text-center select-none", GUTTER_CLASSES[line.kind])}
                >
                  {GUTTER_SIGNS[line.kind]}
                </span>
                <span className="pr-3 whitespace-pre">{line.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
