import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShell } from "@/components/layout/shell-context";
import { useIsMac, WindowDragRegion } from "@/components/layout/WindowDragRegion";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { MAC_WINDOW_CONTROLS_WIDTH_PX, TOP_BAR_HEIGHT_CLASS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useShortcutLabel } from "@/hooks/use-shortcut-label";

export interface TopBarProps {
  /** Receives the node `<PageHeader>` portals the title into. */
  titleSlotRef: (node: HTMLElement | null) => void;
  /** Receives the node `<PageHeader>` portals the page actions into. */
  actionsSlotRef: (node: HTMLElement | null) => void;
}

/** Window title bar: sidebar toggle, page title, ⌘K trigger and the current page's actions. */
export function TopBar({ titleSlotRef, actionsSlotRef }: TopBarProps): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const { state, isMobile } = useSidebar();
  const isMac = useIsMac();
  const paletteLabel = useShortcutLabel("palette");
  // With the sidebar reduced to icons (or hidden) the macOS window buttons reach into the top bar.
  const sidebarWidth = isMobile ? "0px" : "var(--sidebar-width-icon)";
  const clearControls = isMac && (state === "collapsed" || isMobile);

  return (
    <WindowDragRegion
      className={cn("gap-3 border-b bg-background pr-4 pl-3", TOP_BAR_HEIGHT_CLASS)}
      style={
        clearControls
          ? {
              paddingLeft: `max(0.75rem, calc(${MAC_WINDOW_CONTROLS_WIDTH_PX}px - ${sidebarWidth}))`,
            }
          : undefined
      }
    >
      <SidebarTrigger
        className="app-no-drag text-muted-foreground"
        aria-label={t("shell.toggleSidebar")}
        title={t("shell.toggleSidebar")}
      />
      <div ref={titleSlotRef} className="min-w-0 flex-1" />
      <button
        type="button"
        onClick={shell.openCommandPalette}
        className="app-no-drag inline-flex h-8 w-64 shrink-0 items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-lg:w-auto"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left max-lg:sr-only">{t("shell.searchTrigger")}</span>
        <Kbd>{paletteLabel}</Kbd>
      </button>
      <div
        ref={actionsSlotRef}
        className="app-no-drag flex shrink-0 items-center gap-2 empty:hidden"
      />
    </WindowDragRegion>
  );
}
