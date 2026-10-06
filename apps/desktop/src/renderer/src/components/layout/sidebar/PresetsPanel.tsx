import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { SidebarPanel } from "@/components/layout/sidebar/SidebarPanel";
import { useShell } from "@/components/layout/shell-context";
import { PresetIcon } from "@/components/PresetIcon";
import { SortableList } from "@/components/SortableList";
import { MoveMenuItems } from "@/components/MoveItems";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { useRemovePreset, useReorderPresets } from "@/hooks/mutations/presets";
import { usePresets } from "@/hooks/queries/presets";
import { moveId } from "@/lib/utils";

/**
 * Presets section of the sidebar, in the user's order: drag to reorder, right-click to edit or
 * delete, "+" to create.
 */
export function PresetsPanel(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const presets = usePresets();
  const reorder = useReorderPresets();
  const { ask: askDelete } = useRemovePreset();
  const items = presets.data ?? [];
  const ids = items.map((preset) => preset.id);

  return (
    <SidebarPanel
      title={t("activityBar.presets")}
      action={{ label: t("presets.new"), icon: <Plus />, onClick: () => shell.openPresetDialog() }}
    >
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            {presets.isPending ? <SidebarMenuSkeleton showIcon /> : null}
            <SortableList
              items={items}
              itemAs="li"
              itemClassName="group/menu-item relative"
              onReorder={(next) => reorder.mutate(next)}
              renderItem={(preset, index) => (
                <SidebarNavItem
                  link={{ to: "/presets/$presetId", params: { presetId: preset.id } }}
                  label={preset.name}
                  icon={<PresetIcon icon={preset.icon} size="sm" className="-mx-0.5" />}
                  badge={preset.skillIds.length}
                  contextMenu={
                    <>
                      <ContextMenuItem onSelect={() => shell.openPresetDialog(preset)}>
                        {t("presets.edit")}
                      </ContextMenuItem>
                      <MoveMenuItems
                        index={index}
                        total={ids.length}
                        onMove={(step) => reorder.mutate(moveId(ids, preset.id, step))}
                        Item={ContextMenuItem}
                      />
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => void askDelete(preset)}
                      >
                        {t("common.delete")}
                      </ContextMenuItem>
                    </>
                  }
                />
              )}
            />
            {!presets.isPending && items.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-muted-foreground"
                  onClick={() => shell.openPresetDialog()}
                >
                  <Plus />
                  <span>{t("presets.new")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarPanel>
  );
}
