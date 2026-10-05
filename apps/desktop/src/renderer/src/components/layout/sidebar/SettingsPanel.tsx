import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { SidebarPanel } from "@/components/layout/sidebar/SidebarPanel";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/features/settings/constants";
import { SETTINGS_SECTION_ICONS } from "@/features/settings/section-icons";

/** Settings section of the sidebar: one entry per settings page section. */
export function SettingsPanel(): ReactNode {
  const { t } = useTranslation();
  const location = useLocation();
  const onSettings = location.pathname.startsWith("/settings");
  const search = location.search as { section?: SettingsSection };
  const current = onSettings ? (search.section ?? DEFAULT_SETTINGS_SECTION) : null;

  return (
    <SidebarPanel title={t("activityBar.settings")}>
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            {SETTINGS_SECTIONS.map((id) => {
              const Icon = SETTINGS_SECTION_ICONS[id];
              return (
                <SidebarMenuItem key={id}>
                  <SidebarNavItem
                    link={{ to: "/settings", search: { section: id } }}
                    label={t(`settings.sections.${id}.title`)}
                    icon={<Icon />}
                    // No section in the address means the default one.
                    active={current === id}
                  />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarPanel>
  );
}
