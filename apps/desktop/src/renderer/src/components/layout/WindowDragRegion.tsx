import type { CSSProperties, ReactNode } from "react";
import { useAppInfo } from "@/hooks/queries/app";
import { MAC_WINDOW_CONTROLS_WIDTH_PX } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface WindowDragRegionProps {
  /** Keep the top-left corner free for the macOS window buttons. */
  reserveWindowControls?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** True on macOS, where the window buttons float over the top-left of our content. */
export function useIsMac(): boolean {
  return useAppInfo().data?.platform === "darwin";
}

/** A strip that drags the frameless window. Put `app-no-drag` on anything clickable inside it. */
export function WindowDragRegion({
  reserveWindowControls,
  children,
  className,
  style,
}: WindowDragRegionProps): ReactNode {
  const isMac = useIsMac();
  return (
    <div
      className={cn("app-drag flex shrink-0 items-center", className)}
      style={{
        ...style,
        paddingLeft:
          reserveWindowControls && isMac ? MAC_WINDOW_CONTROLS_WIDTH_PX : style?.paddingLeft,
      }}
    >
      {children}
    </div>
  );
}
