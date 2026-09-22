import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityBar } from "@/components/layout/ActivityBar";
import { AgentsPanel } from "@/components/layout/sidebar/AgentsPanel";
import { HomePanel } from "@/components/layout/sidebar/HomePanel";
import { LibraryPanel } from "@/components/layout/sidebar/LibraryPanel";
import { PresetsPanel } from "@/components/layout/sidebar/PresetsPanel";
import { ProjectsPanel } from "@/components/layout/sidebar/ProjectsPanel";
import {
  DEFAULT_SIDEBAR_SECTION,
  SECTION_PAGES,
  type SidebarSection,
  isSidebarSection,
  sectionForPath,
} from "@/components/layout/sidebar/sections";
import { SettingsPanel } from "@/components/layout/sidebar/SettingsPanel";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { STORAGE_KEYS } from "@/lib/constants";
import { SHORTCUT_KEYS } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const PANELS: Record<SidebarSection, () => ReactNode> = {
  home: HomePanel,
  library: LibraryPanel,
  agents: AgentsPanel,
  presets: PresetsPanel,
  projects: ProjectsPanel,
  settings: SettingsPanel,
};

/**
 * The left of the window: the activity bar, always there, and the sidebar next to it, which
 * lists the section picked in the activity bar and folds away with ⌘B. Opening a page of another
 * section (a link, the palette, the tray) switches the sidebar to that section.
 */
export function AppSidebar(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { open, setOpen } = useSidebar();
  const [stored, setStored] = usePersistedState<SidebarSection>(
    STORAGE_KEYS.sidebarSection,
    DEFAULT_SIDEBAR_SECTION,
  );
  const section = isSidebarSection(stored) ? stored : DEFAULT_SIDEBAR_SECTION;
  const pathname = useLocation({ select: (location) => location.pathname });

  // Follow the page into its section; a page without one (backup) keeps whatever is shown.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    const pageSection = sectionForPath(pathname);
    if (pageSection && pageSection !== section) setStored(pageSection);
  }

  const show = (next: SidebarSection): void => {
    setStored(next);
    setOpen(true);
    const page = SECTION_PAGES[next];
    if (page && sectionForPath(pathname) !== next) void navigate({ to: page });
  };

  /** An activity bar button: show its section, or fold the sidebar when it is already shown. */
  const pick = (next: SidebarSection): void => {
    if (open && next === section && (!SECTION_PAGES[next] || sectionForPath(pathname) === next)) {
      setOpen(false);
      return;
    }
    show(next);
  };

  const hotkey = (next: SidebarSection) => (event: KeyboardEvent) => {
    event.preventDefault();
    show(next);
  };
  useHotkey(SHORTCUT_KEYS.sectionHome, hotkey("home"));
  useHotkey(SHORTCUT_KEYS.sectionLibrary, hotkey("library"));
  useHotkey(SHORTCUT_KEYS.sectionAgents, hotkey("agents"));
  useHotkey(SHORTCUT_KEYS.sectionPresets, hotkey("presets"));
  useHotkey(SHORTCUT_KEYS.sectionProjects, hotkey("projects"));

  const Panel = PANELS[section];

  return (
    <>
      <ActivityBar section={section} sidebarOpen={open} onSection={pick} />
      <div
        data-state={open ? "expanded" : "collapsed"}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "h-full shrink-0 overflow-hidden bg-sidebar transition-[width] duration-200 ease-linear",
          open ? "w-(--sidebar-width) border-r" : "w-0",
        )}
      >
        {/* Fixed width inside, so the lists do not reflow while the sidebar slides. */}
        <Sidebar
          collapsible="none"
          aria-label={t("sidebar.label", { section: t(`activityBar.${section}`) })}
          className="h-full"
        >
          <Panel />
        </Sidebar>
      </div>
    </>
  );
}
