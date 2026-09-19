import { X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface TagPillProps {
  tag: string;
  /** Highlighted, e.g. chosen in a filter. */
  active?: boolean;
  /** Struck through, e.g. marked for removal in a batch edit. */
  struck?: boolean;
  count?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onRemove?: () => void;
  className?: string;
}

const PILL_CLASS =
  "inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded-full border px-2 text-xs transition-colors";

/** A tag. Plain label by default; a toggle when `onClick` is set; removable when `onRemove` is set. */
export function TagPill({
  tag,
  active,
  struck,
  count,
  onClick,
  onRemove,
  className,
}: TagPillProps): ReactNode {
  const { t } = useTranslation();
  const tone = cn(
    active
      ? "border-primary/40 bg-primary/15 text-primary"
      : "border-border bg-muted/60 text-muted-foreground",
    struck && "border-danger/40 bg-danger/10 text-danger line-through",
  );
  const body = (
    <>
      <span className="truncate">{tag}</span>
      {count === undefined ? null : <span className="tabular-nums opacity-70">{count}</span>}
    </>
  );

  if (!onClick) {
    return (
      <span className={cn(PILL_CLASS, tone, className)}>
        {body}
        {onRemove ? (
          <button
            type="button"
            aria-label={t("tags.removeTag", { tag })}
            onClick={onRemove}
            className="-mr-1 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        PILL_CLASS,
        tone,
        "hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {body}
    </button>
  );
}
