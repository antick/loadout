import type { ReactNode } from "react";
import { useAppInfo } from "@/hooks/queries/app";
import { cn } from "@/lib/utils";

export interface WindowDragRegionProps {
  children?: ReactNode;
  className?: string;
}

/** True on macOS, where the window buttons float over the top-left of our content. */
export function useIsMac(): boolean {
  return useAppInfo().data?.platform === "darwin";
}

/** A strip that drags the frameless window. Put `app-no-drag` on anything clickable inside it. */
export function WindowDragRegion({ children, className }: WindowDragRegionProps): ReactNode {
  return <div className={cn("app-drag flex shrink-0 items-center", className)}>{children}</div>;
}
