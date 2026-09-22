import type { Preset } from "@loadout/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { SidebarPanel } from "@/components/layout/sidebar/SidebarPanel";
import { useShell } from "@/components/layout/shell-context";
import { PresetIcon } from "@/components/PresetIcon";
import { SortableList } from "@/components/SortableList";
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
  const confirm = useConfirm();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const presets = usePresets();
  const reorder = useReorderPresets();
  const remove = useRemovePreset();
  const items = presets.data ?? [];
  const ids = items.map((preset) => preset.id);

  const askDelete = async (preset: Preset): Promise<void> => {
    const ok = await confirm({
      title: t("presets.deleteTitle", { name: preset.name }),
      description: t("presets.deleteDescription"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(preset);
    if (params.presetId === preset.id) void navigate({ to: "/presets" });
  };

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
                      <ContextMenuItem
                        disabled={index === 0}
                        onSelect={() => reorder.mutate(moveId(ids, preset.id, -1))}
                      >
                        {t("common.moveUp")}
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={index === ids.length - 1}
                        onSelect={() => reorder.mutate(moveId(ids, preset.id, 1))}
                      >
                        {t("common.moveDown")}
                      </ContextMenuItem>
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
                  tooltip={t("presets.new")}
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
