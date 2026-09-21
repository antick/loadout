import type { BackupStatus } from "@loadout/shared";
import { APP_NAME } from "@loadout/shared";
import { CloudUpload, Download, LayoutDashboard, Library, LifeBuoy, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentsGroup } from "@/components/layout/sidebar/AgentsGroup";
import { PresetsGroup } from "@/components/layout/sidebar/PresetsGroup";
import { ProjectsGroup } from "@/components/layout/sidebar/ProjectsGroup";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { useShell } from "@/components/layout/shell-context";
import { WindowDragRegion } from "@/components/layout/WindowDragRegion";
import type { StatusTone } from "@/components/StatusBadge";
import { StatusDot } from "@/components/StatusDot";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useAppInfo, useBackupStatus } from "@/hooks/queries/app";
import { useSkills } from "@/hooks/queries/skills";
import { TOP_BAR_HEIGHT_CLASS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Backup health as a dot: grey = not set up, amber = changes waiting, red = broken, green = synced. */
function backupTone(status: BackupStatus | undefined): StatusTone | null {
  if (!status) return null;
  if (!status.isRepo || !status.remoteUrl) return "neutral";
  if (status.upstreamHealth !== "healthy" || !status.gitAvailable) return "danger";
  if (status.hasChanges || status.ahead > 0 || status.behind > 0) return "warning";
  return "success";
}

/** The app's left navigation. Collapses to icons with ⌘B. */
export function AppSidebar(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const skills = useSkills();
  const info = useAppInfo();
  const backup = useBackupStatus();
  const tone = backupTone(backup.data);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-0">
        <WindowDragRegion
          reserveWindowControls
          className={cn("px-4 group-data-[collapsible=icon]:hidden", TOP_BAR_HEIGHT_CLASS)}
        >
          <span className="flex items-center gap-2 text-sm leading-none font-semibold tracking-tight">
            <img src="./brand.svg" alt="" className="size-[18px] shrink-0" />
            {APP_NAME}
          </span>
        </WindowDragRegion>
        <WindowDragRegion
          className={cn("hidden group-data-[collapsible=icon]:flex", TOP_BAR_HEIGHT_CLASS)}
        />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarNavItem
                  link={{ to: "/" }}
                  exact
                  label={t("nav.dashboard")}
                  icon={<LayoutDashboard />}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem
                  link={{ to: "/library" }}
                  label={t("nav.library")}
                  icon={<Library />}
                  badge={skills.data?.length}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem
                  link={{ to: "/install" }}
                  label={t("nav.install")}
                  icon={<Download />}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <AgentsGroup />
        <PresetsGroup />
        <ProjectsGroup />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarNavItem
              link={{ to: "/backup" }}
              label={t("nav.backup")}
              icon={<CloudUpload />}
              indicator={tone ? <StatusDot tone={tone} label={t(`backup.dot.${tone}`)} /> : null}
            />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavItem
              link={{ to: "/settings" }}
              label={t("nav.settings")}
              icon={<Settings />}
            />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t("nav.help")} onClick={shell.openHelp}>
              <LifeBuoy />
              <span>{t("nav.help")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {info.data ? (
          <p
            data-selectable
            className="px-2 font-mono text-[0.6875rem] text-muted-foreground group-data-[collapsible=icon]:hidden"
          >
            {t("shell.version", { version: info.data.version })}
          </p>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
