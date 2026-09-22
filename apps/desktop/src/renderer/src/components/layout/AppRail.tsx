import type { BackupStatus, ThemeSetting } from "@loadout/shared";
import { APP_NAME } from "@loadout/shared";
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
  Monitor,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/providers/ThemeProvider";
import { RailButton } from "@/components/layout/sidebar/RailButton";
import {
  SECTION_SHORTCUTS,
  SIDEBAR_SECTIONS,
  type SidebarSection,
  sectionForPath,
} from "@/components/layout/sidebar/sections";
import { useShell } from "@/components/layout/shell-context";
import { useIsMac, WindowDragRegion } from "@/components/layout/WindowDragRegion";
import type { StatusTone } from "@/components/StatusBadge";
import { StatusDot } from "@/components/StatusDot";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useAppInfo, useBackupStatus } from "@/hooks/queries/app";
import { RAIL_WIDTH_PX, TOP_BAR_HEIGHT_CLASS } from "@/lib/constants";
import { shortcutLabel } from "@/lib/shortcuts";

const SECTION_ICONS: Record<SidebarSection, LucideIcon> = {
  library: Library,
  agents: Bot,
  presets: Layers,
  projects: FolderKanban,
};

const THEME_ORDER: readonly ThemeSetting[] = ["system", "light", "dark"];
const THEME_ICONS: Record<ThemeSetting, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

/** Backup health as a dot: grey = not set up, amber = changes waiting, red = broken, green = synced. */
function backupTone(status: BackupStatus | undefined): StatusTone | null {
  if (!status) return null;
  if (!status.isRepo || !status.remoteUrl) return "neutral";
  if (status.upstreamHealth !== "healthy" || !status.gitAvailable) return "danger";
  if (status.hasChanges || status.ahead > 0 || status.behind > 0) return "warning";
  return "success";
}

export interface AppRailProps {
  /** Section the sidebar shows, and whether the sidebar is open at all. */
  section: SidebarSection;
  panelOpen: boolean;
  onSection(section: SidebarSection): void;
}

/**
 * The narrow strip at the far left. Library, Agents, Presets and Projects switch what the
 * sidebar next to it lists (pressing the one already shown folds the sidebar away); Home,
 * Backup and Settings open their page. Always visible, so every area is one click away.
 */
export function AppRail({ section, panelOpen, onSection }: AppRailProps): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const isMac = useIsMac();
  const info = useAppInfo();
  const platform = info.data?.platform;
  const pathname = useLocation({ select: (location) => location.pathname });
  const pageSection = sectionForPath(pathname);
  const backup = useBackupStatus();
  const tone = backupTone(backup.data);
  const { theme } = useTheme();
  const setSetting = useSetSetting();
  const ThemeIcon = THEME_ICONS[theme];
  const nextTheme: ThemeSetting =
    THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length] ?? "system";

  return (
    <nav
      aria-label={t("rail.label")}
      style={{ width: RAIL_WIDTH_PX }}
      className="flex h-svh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground"
    >
      {/* On macOS the window buttons sit here; elsewhere the logo does. */}
      <WindowDragRegion className={`justify-center ${TOP_BAR_HEIGHT_CLASS}`}>
        {isMac ? null : <img src="./brand.svg" alt={APP_NAME} className="size-5" />}
      </WindowDragRegion>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1.5 pt-1">
        <RailButton
          icon={<House />}
          label={t("rail.home")}
          link={{ to: "/" }}
          current={pathname === "/"}
        />
        {SIDEBAR_SECTIONS.map((id) => {
          const Icon = SECTION_ICONS[id];
          return (
            <RailButton
              key={id}
              icon={<Icon />}
              label={t(`rail.${id}`)}
              shortcut={shortcutLabel(SECTION_SHORTCUTS[id], platform)}
              current={pageSection === id}
              selected={panelOpen && section === id}
              pressed={panelOpen && section === id}
              onClick={() => onSection(id)}
            />
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1 px-1.5 pt-2 pb-3">
        <RailButton
          icon={<CloudUpload />}
          label={t("nav.backup")}
          link={{ to: "/backup" }}
          current={pathname.startsWith("/backup")}
          indicator={tone ? <StatusDot tone={tone} label={t(`backup.dot.${tone}`)} /> : null}
        />
        <RailButton
          icon={<Settings />}
          label={t("nav.settings")}
          shortcut={shortcutLabel("settings", platform)}
          link={{ to: "/settings" }}
          current={pathname.startsWith("/settings")}
        />
        <div className="flex w-full justify-center gap-0.5">
          <RailButton iconOnly icon={<LifeBuoy />} label={t("nav.help")} onClick={shell.openHelp} />
          <RailButton
            iconOnly
            icon={<ThemeIcon />}
            label={t("rail.theme", { current: t(`rail.themes.${theme}`) })}
            onClick={() => setSetting.mutate({ key: "theme", value: nextTheme })}
          />
        </div>
        {info.data ? (
          <p
            data-selectable
            title={t("shell.version", { version: info.data.version })}
            className="max-w-full truncate font-mono text-[0.625rem] text-muted-foreground"
          >
            {info.data.version}
          </p>
        ) : null}
      </div>
    </nav>
  );
}
