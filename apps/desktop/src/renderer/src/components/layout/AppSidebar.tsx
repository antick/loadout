import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRail } from "@/components/layout/AppRail";
import { AgentsPanel } from "@/components/layout/sidebar/AgentsPanel";
import { LibraryPanel } from "@/components/layout/sidebar/LibraryPanel";
import { PresetsPanel } from "@/components/layout/sidebar/PresetsPanel";
import { ProjectsPanel } from "@/components/layout/sidebar/ProjectsPanel";
import {
  DEFAULT_SIDEBAR_SECTION,
  SECTION_SHORTCUTS,
  type SidebarSection,
  isSidebarSection,
  sectionForPath,
} from "@/components/layout/sidebar/sections";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { STORAGE_KEYS } from "@/lib/constants";
import { SHORTCUT_KEYS } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const PANELS: Record<SidebarSection, () => ReactNode> = {
  library: LibraryPanel,
  agents: AgentsPanel,
  presets: PresetsPanel,
  projects: ProjectsPanel,
};

/**
 * The app's left navigation in two parts: the icon rail, always there, and the sidebar next to
 * it, which lists the section picked in the rail and folds away with ⌘B. Opening a page of
 * another section (from a link, the palette or the tray) switches the sidebar to that section.
 */
export function AppSidebar(): ReactNode {
  const { t } = useTranslation();
  const { open, setOpen } = useSidebar();
  const [stored, setStored] = usePersistedState<SidebarSection>(
    STORAGE_KEYS.sidebarSection,
    DEFAULT_SIDEBAR_SECTION,
  );
  const section = isSidebarSection(stored) ? stored : DEFAULT_SIDEBAR_SECTION;
  const pathname = useLocation({ select: (location) => location.pathname });

  // Follow the page into its section; pages of their own keep whatever is shown.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    const pageSection = sectionForPath(pathname);
    if (pageSection && pageSection !== section) setStored(pageSection);
  }

  /** The rail button: show that section, or fold the sidebar when it is already shown. */
  const pick = (next: SidebarSection): void => {
    if (open && next === section) {
      setOpen(false);
      return;
    }
    setStored(next);
    setOpen(true);
  };

  const showSection = (next: SidebarSection): void => {
    setStored(next);
    setOpen(true);
  };
  useHotkey(SHORTCUT_KEYS[SECTION_SHORTCUTS.library], (event) => {
    event.preventDefault();
    showSection("library");
  });
  useHotkey(SHORTCUT_KEYS[SECTION_SHORTCUTS.agents], (event) => {
    event.preventDefault();
    showSection("agents");
  });
  useHotkey(SHORTCUT_KEYS[SECTION_SHORTCUTS.presets], (event) => {
    event.preventDefault();
    showSection("presets");
  });
  useHotkey(SHORTCUT_KEYS[SECTION_SHORTCUTS.projects], (event) => {
    event.preventDefault();
    showSection("projects");
  });

  const Panel = PANELS[section];

  return (
    <>
      <AppRail section={section} panelOpen={open} onSection={pick} />
      <div
        data-state={open ? "expanded" : "collapsed"}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "h-svh shrink-0 overflow-hidden border-r bg-sidebar transition-[width] duration-200 ease-linear",
          open ? "w-(--sidebar-width)" : "w-0 border-r-0",
        )}
      >
        {/* Fixed width inside, so the lists do not reflow while the panel slides. */}
        <Sidebar
          collapsible="none"
          aria-label={t("sidebar.label", { section: t(`rail.${section}`) })}
          className="h-svh"
        >
          <Panel />
        </Sidebar>
      </div>
    </>
  );
}
