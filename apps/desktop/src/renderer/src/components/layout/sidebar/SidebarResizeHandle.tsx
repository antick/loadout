import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ResizeHandle } from "@/components/ResizeHandle";
import {
  ACTIVITY_BAR_WIDTH_PX,
  PAGE_MIN_WIDTH_PX,
  SIDEBAR_WIDTH_DEFAULT_PX,
  SIDEBAR_WIDTH_MAX_PX,
  SIDEBAR_WIDTH_MIN_PX,
  SIDEBAR_WIDTH_STEP_PX,
} from "@/lib/constants";
import { clampTo, fitMax } from "@/lib/resize";
import { cn } from "@/lib/utils";

export function clampSidebarWidth(width: number): number {
  return clampTo(width, SIDEBAR_WIDTH_MIN_PX, SIDEBAR_WIDTH_MAX_PX);
}

/** The widest the sidebar may be in a window this wide, leaving the page its minimum. */
export function sidebarMaxFor(windowWidth: number): number {
  return fitMax(
    windowWidth - ACTIVITY_BAR_WIDTH_PX,
    PAGE_MIN_WIDTH_PX,
    SIDEBAR_WIDTH_MIN_PX,
    SIDEBAR_WIDTH_MAX_PX,
  );
}

export interface SidebarResizeHandleProps {
  width: number;
  /** How far it may be dragged; less than the usual maximum in a narrow window. */
  max: number;
  onWidth(width: number): void;
  className?: string;
}

/** The sidebar's right edge: drag it to resize, double-click to reset, or use the arrow keys. */
export function SidebarResizeHandle({
  width,
  max,
  onWidth,
  className,
}: SidebarResizeHandleProps): ReactNode {
  const { t } = useTranslation();
  return (
    <ResizeHandle
      orientation="vertical"
      value={width}
      min={SIDEBAR_WIDTH_MIN_PX}
      max={max}
      defaultValue={SIDEBAR_WIDTH_DEFAULT_PX}
      step={SIDEBAR_WIDTH_STEP_PX}
      fromDrag={(start, delta) => start + delta}
      onValue={onWidth}
      label={t("sidebar.resize")}
      className={cn("absolute inset-y-0 -right-1.5 w-3", className)}
    />
  );
}
