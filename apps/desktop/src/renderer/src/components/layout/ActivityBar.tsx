import { useLocation } from "@tanstack/react-router";
import {
  Bot,
  CloudUpload,
  FolderKanban,
  House,
  Layers,
  Library,
  LifeBuoy,
  type LucideIcon,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActivityBarButton } from "@/components/layout/ActivityBarButton";
import {
  SECTION_SHORTCUTS,
  type SidebarSection,
  sectionForPath,
} from "@/components/layout/sidebar/sections";
import { useShell } from "@/components/layout/shell-context";
import { StatusDot } from "@/components/StatusDot";
import { useAppInfo, useBackupStatus } from "@/hooks/queries/app";
import { backupTone } from "@/lib/backup-tone";
import { ACTIVITY_BAR_WIDTH_PX } from "@/lib/constants";
import { shortcutLabel } from "@/lib/shortcuts";

/** Sections in the top group, in order. Settings sits in the bottom group. */
const TOP_SECTIONS: readonly { id: SidebarSection; icon: LucideIcon }[] = [
  { id: "home", icon: House },
  { id: "library", icon: Library },
  { id: "agents", icon: Bot },
  { id: "presets", icon: Layers },
  { id: "projects", icon: FolderKanban },
];

export interface ActivityBarProps {
  /** Section the sidebar shows, and whether the sidebar is open at all. */
  section: SidebarSection;
  sidebarOpen: boolean;
  onSection(section: SidebarSection): void;
}

/**
 * The activity bar: the icon strip at the far left, always visible. Each section button shows
 * that section in the sidebar (Home and Settings also open their page); pressing the section
 * already shown folds the sidebar away. Backup opens its page, Help the guide.
 */
export function ActivityBar({ section, sidebarOpen, onSection }: ActivityBarProps): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const platform = useAppInfo().data?.platform;
  const pathname = useLocation({ select: (location) => location.pathname });
  const pageSection = sectionForPath(pathname);
  const tone = backupTone(useBackupStatus().data);

  const sectionButton = (id: SidebarSection, Icon: LucideIcon): ReactNode => {
    const shortcut = SECTION_SHORTCUTS[id];
    const shown = sidebarOpen && section === id;
    // One marker: the section picked. With the sidebar folded, the page's section instead.
    // A page outside every section (backup) keeps the marker on its own button.
    const current = pageSection !== null && (sidebarOpen ? shown : pageSection === id);
    return (
      <ActivityBarButton
        key={id}
        icon={<Icon />}
        label={t(`activityBar.${id}`)}
        shortcut={shortcut ? shortcutLabel(shortcut, platform) : undefined}
        current={current}
        selected={shown}
        pressed={shown}
        onClick={() => onSection(id)}
      />
    );
  };

  return (
    <nav
      aria-label={t("activityBar.label")}
      style={{ width: ACTIVITY_BAR_WIDTH_PX }}
      className="flex h-full shrink-0 flex-col border-r border-rail-border bg-rail text-rail-foreground"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1.5 pt-2">
        {TOP_SECTIONS.map(({ id, icon }) => sectionButton(id, icon))}
      </div>
      <div className="flex flex-col gap-1 px-1.5 pt-2 pb-2">
        <ActivityBarButton
          icon={<CloudUpload />}
          label={t("nav.backup")}
          link={{ to: "/backup" }}
          current={pathname.startsWith("/backup")}
          indicator={tone ? <StatusDot tone={tone} label={t(`backup.dot.${tone}`)} /> : null}
        />
        {sectionButton("settings", Settings)}
        <ActivityBarButton icon={<LifeBuoy />} label={t("nav.help")} onClick={shell.openHelp} />
      </div>
    </nav>
  );
}
