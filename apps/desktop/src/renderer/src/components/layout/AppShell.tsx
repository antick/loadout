import type { Preset } from "@skillboard/shared";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { AppUpdateToast } from "@/components/AppUpdateToast";
import { CloseDialog } from "@/components/CloseDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { CrashBanner } from "@/components/CrashBanner";
import { HelpDialog } from "@/components/HelpDialog";
import { AppSidebar } from "@/components/layout/AppSidebar";
import {
  PageHeaderSlotsContext,
  type ShellActions,
  ShellContext,
} from "@/components/layout/shell-context";
import { TopBar } from "@/components/layout/TopBar";
import { LibraryWarningBanner } from "@/components/LibraryWarningBanner";
import { PresetDialog } from "@/components/PresetDialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { FirstRunDialog } from "@/features/backup/FirstRunDialog";
import { AddProjectDialog } from "@/features/projects/AddProjectDialog";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { STORAGE_KEYS } from "@/lib/constants";
import { SHORTCUT_KEYS } from "@/lib/shortcuts";

/**
 * Frame of every screen: sidebar, top bar, banners, the scrolling `<main>`, and the dialogs any
 * page can open through `useShell()`. Pages render inside `children` and set their title and
 * top-bar buttons with `<PageHeader>`.
 */
export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = usePersistedState(STORAGE_KEYS.sidebarOpen, true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [presetDialog, setPresetDialog] = useState<{ open: boolean; preset: Preset | null }>({
    open: false,
    preset: null,
  });
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);

  const shell = useMemo<ShellActions>(
    () => ({
      openCommandPalette: () => setPaletteOpen(true),
      openHelp: () => setHelpOpen(true),
      openPresetDialog: (preset) => setPresetDialog({ open: true, preset: preset ?? null }),
      openAddProject: () => setAddProjectOpen(true),
    }),
    [],
  );
  const slots = useMemo(
    () => ({ title: titleSlot, actions: actionsSlot }),
    [titleSlot, actionsSlot],
  );

  useHotkey(SHORTCUT_KEYS.palette, (event) => {
    event.preventDefault();
    setPaletteOpen((open) => !open);
  });
  useHotkey(SHORTCUT_KEYS.settings, (event) => {
    event.preventDefault();
    void navigate({ to: "/settings" });
  });

  return (
    <ShellContext.Provider value={shell}>
      <PageHeaderSlotsContext.Provider value={slots}>
        <SidebarProvider
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          className="h-svh min-h-0 overflow-hidden"
        >
          <AppSidebar />
          <SidebarInset className="min-w-0 overflow-hidden">
            <TopBar titleSlotRef={setTitleSlot} actionsSlotRef={setActionsSlot} />
            <CrashBanner />
            <LibraryWarningBanner />
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
        <PresetDialog
          open={presetDialog.open}
          preset={presetDialog.preset}
          onOpenChange={(open) => setPresetDialog((previous) => ({ ...previous, open }))}
          onSaved={(saved) => {
            if (!presetDialog.preset)
              void navigate({ to: "/presets/$presetId", params: { presetId: saved.id } });
          }}
        />
        <AddProjectDialog
          open={addProjectOpen}
          onOpenChange={setAddProjectOpen}
          onAdded={(project) =>
            void navigate({ to: "/projects/$projectId", params: { projectId: project.id } })
          }
        />
        <CloseDialog />
        <FirstRunDialog />
        <AppUpdateToast />
      </PageHeaderSlotsContext.Provider>
    </ShellContext.Provider>
  );
}
