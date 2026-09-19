import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";

export interface PagerProps {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  /** Number of items across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Number of pages needed for `total` items; never less than one. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The items of one page. Clamp `page` with {@link pageCount} first when the list can shrink. */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  return items.slice(page * pageSize, (page + 1) * pageSize);
}

/** "Showing 25–48 of 120" with previous / next, for lists paged in the renderer. */
export function Pager({ page, pageSize, total, onPageChange, className }: PagerProps): ReactNode {
  const { t } = useTranslation();
  const pages = pageCount(total, pageSize);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <nav
      aria-label={t("pager.label")}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        {t("pager.range", { from, to, total })}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <IconButton
            variant="outline"
            label={t("pager.previous")}
            icon={<ChevronLeft />}
            disabled={page <= 0}
            onClick={() => onPageChange(page - 1)}
          />
          <span className="px-2 text-xs text-muted-foreground tabular-nums">
            {t("pager.page", { page: page + 1, pages })}
          </span>
          <IconButton
            variant="outline"
            label={t("pager.next")}
            icon={<ChevronRight />}
            disabled={page >= pages - 1}
            onClick={() => onPageChange(page + 1)}
          />
        </div>
      ) : null}
    </nav>
  );
}
