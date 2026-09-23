import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useContext, useState } from "react";
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
  isSectionPage,
  isSidebarSection,
  sectionForPath,
} from "@/components/layout/sidebar/sections";
import { SidebarSlotRefContext, useSidebarTakeover } from "@/components/layout/shell-context";
import { SettingsPanel } from "@/components/layout/sidebar/SettingsPanel";
import { SidebarResizeHandle } from "@/components/layout/sidebar/SidebarResizeHandle";
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

export interface AppSidebarProps {
  /** Sidebar width in pixels, changed by dragging its edge. */
  width: number;
  /** How wide dragging may take it in this window. */
  maxWidth: number;
  onWidth(width: number): void;
}

/**
 * The left of the window: the activity bar, always there, and the sidebar next to it, which
 * lists the section picked in the activity bar, folds away with ⌘B and resizes from its edge.
 * Picking a section opens its main page; opening a page of another section switches the sidebar. A page can take the
 * sidebar over for its own list (the editor shows the skill's files) until a section is picked.
 */
export function AppSidebar({ width, maxWidth, onWidth }: AppSidebarProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { open, setOpen } = useSidebar();
  const takeover = useSidebarTakeover();
  const setSlot = useContext(SidebarSlotRefContext);
  const [stored, setStored] = usePersistedState<SidebarSection>(
    STORAGE_KEYS.sidebarSection,
    DEFAULT_SIDEBAR_SECTION,
  );
  const section = isSidebarSection(stored) ? stored : DEFAULT_SIDEBAR_SECTION;
  const { pathname, searchStr } = useLocation({
    select: (location) => ({ pathname: location.pathname, searchStr: location.searchStr }),
  });

  // Follow the page into its section; a page without one (backup) keeps whatever is shown.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    const pageSection = sectionForPath(pathname);
    if (pageSection && pageSection !== section) setStored(pageSection);
  }

  /** Show the section in the sidebar, and open its main page unless a page of it is open. */
  const show = (next: SidebarSection): void => {
    setStored(next);
    setOpen(true);
    if (sectionForPath(pathname) !== next) void navigate({ to: SECTION_PAGES[next] });
  };

  /**
   * An activity bar button. Another section: show it and open its main page. The section of the
   * page on screen: back to its main page from a page inside it (a project, a skill's detail),
   * and on the main page itself, fold the sidebar away or bring it back.
   */
  const pick = (next: SidebarSection): void => {
    // A page's own list is on screen (the editor's files): the button brings the section back.
    if (takeover.active) {
      takeover.setShown(false);
      show(next);
      return;
    }
    if (sectionForPath(pathname) !== next) {
      show(next);
      return;
    }
    if (!isSectionPage(next, pathname, searchStr)) {
      setStored(next);
      setOpen(true);
      void navigate({ to: SECTION_PAGES[next] });
      return;
    }
    if (open && next === section) setOpen(false);
    else show(next);
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
      <ActivityBar section={section} sidebarOpen={open && !takeover.active} onSection={pick} />
      <div className="relative h-full shrink-0">
        <div
          data-state={open ? "expanded" : "collapsed"}
          aria-hidden={!open}
          inert={!open}
          className={cn(
            "h-full overflow-hidden bg-sidebar transition-[width] duration-200 ease-linear",
            open ? "w-(--sidebar-width) border-r" : "w-0",
          )}
        >
          <Sidebar
            collapsible="none"
            aria-label={t("sidebar.label", { section: t(`activityBar.${section}`) })}
            className="h-full"
          >
            {takeover.active ? (
              <div ref={setSlot} className="flex min-h-0 flex-1 flex-col" />
            ) : (
              <Panel />
            )}
          </Sidebar>
        </div>
        {open ? <SidebarResizeHandle width={width} max={maxWidth} onWidth={onWidth} /> : null}
      </div>
    </>
  );
}
