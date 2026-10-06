import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const TONES = {
  muted: "border bg-muted/40",
  warning: "border border-warning/40 bg-warning/10",
} as const;

export interface PathListProps {
  paths: readonly string[];
  /** How many are listed before the rest is summarised as "and N more"; all when unset. */
  max?: number;
  /** `warning` for paths that hold something the person should look at first. */
  tone?: keyof typeof TONES;
  /** Extra classes, e.g. a height cap that scrolls. */
  className?: string;
}

/** Paths in a box, one per line, selectable for copying: what a dialog is about to touch. */
export function PathList({ paths, max, tone = "muted", className }: PathListProps): ReactNode {
  const { t } = useTranslation();
  const shown = max === undefined ? paths : paths.slice(0, max);
  const hidden = paths.length - shown.length;
  return (
    <ul
      data-selectable
      className={cn(
        "rounded-md px-3 py-2 font-mono text-xs leading-5 break-all",
        TONES[tone],
        className,
      )}
    >
      {shown.map((path) => (
        <li key={path}>{path}</li>
      ))}
      {hidden > 0 ? (
        <li className="font-sans text-muted-foreground">
          {t("common.andMore", { count: hidden })}
        </li>
      ) : null}
    </ul>
  );
}
