import { APP_NAME } from "@loadout/shared";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShell } from "@/components/layout/shell-context";
import { useIsMac, WindowDragRegion } from "@/components/layout/WindowDragRegion";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useShortcutLabel } from "@/hooks/use-shortcut-label";
import {
  ACTIVITY_BAR_WIDTH_PX,
  MAC_WINDOW_CONTROLS_WIDTH_PX,
  TOP_BAR_HEIGHT_CLASS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface TitleBarProps {
  /** Receives the node `<PageHeader>` portals the page title into. */
  titleSlotRef: (node: HTMLElement | null) => void;
  /** Receives the node `<PageHeader>` portals the page actions into. */
  actionsSlotRef: (node: HTMLElement | null) => void;
  /** Receives the cell above the sidebar, where the sidebar section puts its name. */
  sidebarHeaderRef: (node: HTMLElement | null) => void;
  /** Receives the spot next to the sidebar toggle for the section's buttons while folded. */
  sidebarActionsRef: (node: HTMLElement | null) => void;
}

/**
 * The window's title bar, one band across the full width: above the activity bar it is left
 * empty for the macOS window buttons (the logo elsewhere), above the sidebar it names the
 * section, then the page title, the command palette and the page's actions. No column line runs
 * through it, so nothing crosses the window buttons.
 */
export function TitleBar({
  titleSlotRef,
  actionsSlotRef,
  sidebarHeaderRef,
  sidebarActionsRef,
}: TitleBarProps): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const { open } = useSidebar();
  const isMac = useIsMac();
  const paletteLabel = useShortcutLabel("palette");
  // With the sidebar folded away the window buttons reach past the activity bar into this row.
  const clearControls = isMac && !open;

  return (
    <WindowDragRegion className={cn("w-full border-b bg-sidebar", TOP_BAR_HEIGHT_CLASS)}>
      <div
        style={{ width: ACTIVITY_BAR_WIDTH_PX }}
        className="flex h-full shrink-0 items-center justify-center"
      >
        {isMac ? null : <img src="./brand.svg" alt={APP_NAME} className="size-5" />}
      </div>
      <div
        ref={sidebarHeaderRef}
        aria-hidden={!open}
        className={cn(
          "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-linear",
          open ? "w-(--sidebar-width)" : "w-0",
        )}
      />
      <div
        className="flex h-full min-w-0 flex-1 items-center gap-3 pr-4 pl-3"
        style={
          clearControls
            ? { paddingLeft: MAC_WINDOW_CONTROLS_WIDTH_PX - ACTIVITY_BAR_WIDTH_PX }
            : undefined
        }
      >
        <SidebarTrigger
          className="app-no-drag text-muted-foreground"
          aria-label={t("shell.toggleSidebar")}
          title={t("shell.toggleSidebar")}
        />
        {/* Filled only while the sidebar is folded: its section's buttons, then a divider. */}
        <div
          ref={sidebarActionsRef}
          className="app-no-drag flex shrink-0 items-center gap-1 border-r pr-3 empty:hidden"
        />
        <div ref={titleSlotRef} className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={shell.openCommandPalette}
          className="app-no-drag inline-flex h-8 w-64 shrink-0 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-lg:w-auto"
        >
          <Search className="size-4" />
          <span className="flex-1 truncate text-left max-lg:sr-only">
            {t("shell.searchTrigger")}
          </span>
          <Kbd>{paletteLabel}</Kbd>
        </button>
        <div
          ref={actionsSlotRef}
          className="app-no-drag flex shrink-0 items-center gap-2 empty:hidden"
        />
      </div>
    </WindowDragRegion>
  );
}
