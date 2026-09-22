// The handle is a focusable separator with a value, per the ARIA window splitter pattern; an
// <hr> cannot be dragged or focused, so these two rules do not apply here.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-tabindex */
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  SIDEBAR_WIDTH_DEFAULT_PX,
  SIDEBAR_WIDTH_MAX_PX,
  SIDEBAR_WIDTH_MIN_PX,
  SIDEBAR_WIDTH_STEP_PX,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_WIDTH_MAX_PX, Math.max(SIDEBAR_WIDTH_MIN_PX, width)));
}

export interface SidebarResizeHandleProps {
  width: number;
  onWidth(width: number): void;
  className?: string;
}

/**
 * The sidebar's right edge: drag it to resize, double-click to reset, or focus it and use the
 * arrow keys. A thin line shows on hover so it can be found.
 */
export function SidebarResizeHandle({
  width,
  onWidth,
  className,
}: SidebarResizeHandleProps): ReactNode {
  const { t } = useTranslation();

  const startDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.dataset.resizing = "";
    const move = (next: globalThis.PointerEvent): void =>
      onWidth(clampSidebarWidth(startWidth + next.clientX - startX));
    const stop = (): void => {
      delete document.body.dataset.resizing;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step !== 0) {
      event.preventDefault();
      onWidth(clampSidebarWidth(width + step * SIDEBAR_WIDTH_STEP_PX));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onWidth(event.key === "Home" ? SIDEBAR_WIDTH_MIN_PX : SIDEBAR_WIDTH_MAX_PX);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("sidebar.resize")}
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH_MIN_PX}
      aria-valuemax={SIDEBAR_WIDTH_MAX_PX}
      tabIndex={0}
      title={t("sidebar.resizeHint")}
      onPointerDown={startDrag}
      onDoubleClick={() => onWidth(SIDEBAR_WIDTH_DEFAULT_PX)}
      onKeyDown={onKeyDown}
      className={cn(
        "group/resize absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize outline-none",
        className,
      )}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/resize:bg-primary/60 group-focus-visible/resize:bg-primary group-active/resize:bg-primary" />
    </div>
  );
}
