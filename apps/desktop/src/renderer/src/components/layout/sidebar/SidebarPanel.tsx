import type { ReactNode } from "react";
import { useIsMac, WindowDragRegion } from "@/components/layout/WindowDragRegion";
import { SidebarContent } from "@/components/ui/sidebar";
import { MAC_WINDOW_CONTROLS_WIDTH_PX, RAIL_WIDTH_PX, TOP_BAR_HEIGHT_CLASS } from "@/lib/constants";

export interface SidebarPanelProps {
  title: string;
  /** One small button at the right of the title, e.g. "New preset". */
  action?: { label: string; icon: ReactNode; onClick: () => void };
  children: ReactNode;
}

/** The sidebar's body for one section: a title row in the window's drag strip, then its lists. */
export function SidebarPanel({ title, action, children }: SidebarPanelProps): ReactNode {
  const isMac = useIsMac();
  // The macOS window buttons reach past the rail into this row.
  const reserve = isMac ? MAC_WINDOW_CONTROLS_WIDTH_PX - RAIL_WIDTH_PX : undefined;

  return (
    <>
      <WindowDragRegion
        className={`justify-between gap-2 pr-2 pl-4 ${TOP_BAR_HEIGHT_CLASS}`}
        style={reserve ? { paddingLeft: reserve } : undefined}
      >
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {action ? (
          <button
            type="button"
            aria-label={action.label}
            title={action.label}
            onClick={action.onClick}
            className="app-no-drag flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none [&_svg]:size-4"
          >
            {action.icon}
          </button>
        ) : null}
      </WindowDragRegion>
      <SidebarContent className="gap-0 pb-3">{children}</SidebarContent>
    </>
  );
}
