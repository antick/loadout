import type { ReactNode } from "react";
import { SidebarHeaderPortal } from "@/components/layout/SidebarHeaderPortal";
import { useIsMac } from "@/components/layout/WindowDragRegion";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACTIVITY_BAR_WIDTH_PX, MAC_WINDOW_CONTROLS_WIDTH_PX } from "@/lib/constants";

export interface SidebarPanelProps {
  title: string;
  /** One small button at the right of the title, e.g. "New preset". */
  action?: { label: string; icon: ReactNode; onClick: () => void };
  children: ReactNode;
}

/**
 * The sidebar's body for one section. Its name and action go into the title bar cell above the
 * sidebar, so the title bar stays one clean band; the lists scroll below. With the sidebar folded
 * away the action moves next to the sidebar toggle, so it never disappears.
 */
export function SidebarPanel({ title, action, children }: SidebarPanelProps): ReactNode {
  const isMac = useIsMac();
  // The macOS window buttons reach past the activity bar into this cell.
  const inset = isMac ? MAC_WINDOW_CONTROLS_WIDTH_PX - ACTIVITY_BAR_WIDTH_PX : undefined;

  const actionButton = action ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={action.label}
          onClick={action.onClick}
          className="app-no-drag text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          {action.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{action.label}</TooltipContent>
    </Tooltip>
  ) : null;

  const header = (
    <div
      className="flex h-full w-(--sidebar-width) items-center justify-between gap-2 pr-2 pl-3"
      style={inset ? { paddingLeft: inset } : undefined}
    >
      <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
      {actionButton}
    </div>
  );

  return (
    <>
      <SidebarHeaderPortal header={header} folded={actionButton} />
      <SidebarContent className="gap-0 pt-1 pb-3">{children}</SidebarContent>
    </>
  );
}
