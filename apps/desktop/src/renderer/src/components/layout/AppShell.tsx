import type { Preset } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { type CSSProperties, type ReactNode, useCallback, useMemo, useState } from "react";
import { AppUpdateToast } from "@/components/AppUpdateToast";
import { CloseDialog } from "@/components/CloseDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { SkillPicker } from "@/components/SkillPicker";
import { CrashBanner } from "@/components/CrashBanner";
import { LibraryMissingDialog } from "@/components/LibraryMissingDialog";
import { HelpDialog } from "@/components/HelpDialog";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { clampSidebarWidth, sidebarMaxFor } from "@/components/layout/sidebar/SidebarResizeHandle";
import {
  PageHeaderSlotsContext,
  type ShellActions,
  ShellContext,
  type SidebarTakeover,
  SidebarSlotRefContext,
  SidebarTakeoverContext,
} from "@/components/layout/shell-context";
import { StatusBar } from "@/components/layout/status-bar/StatusBar";
import { TitleBar } from "@/components/layout/TitleBar";
import { LibraryWarningBanner } from "@/components/LibraryWarningBanner";
import { PresetDialog } from "@/components/PresetDialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { FirstRunDialog } from "@/features/backup/FirstRunDialog";
import { NewSkillDialog } from "@/features/library/NewSkillDialog";
import { FlaggedInstallDialog } from "@/features/safety/FlaggedInstallDialog";
import { AddProjectDialog } from "@/features/projects/AddProjectDialog";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useWindowWidth } from "@/hooks/use-window-width";
import { SIDEBAR_WIDTH_DEFAULT_PX, STORAGE_KEYS } from "@/lib/constants";
import { SHORTCUT_KEYS } from "@/lib/shortcuts";

/**
 * Frame of every screen: the title bar across the top, the activity bar and sidebar on the left,
 * banners and the scrolling page, the status bar along the bottom, and the dialogs any page can
 * open through `useShell()`. Pages render inside `children` and set their title and title-bar
 * buttons with `<PageHeader>`.
 */
export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = usePersistedState(STORAGE_KEYS.sidebarOpen, true);
  const [storedWidth, setSidebarWidth] = usePersistedState(
    STORAGE_KEYS.sidebarWidth,
    SIDEBAR_WIDTH_DEFAULT_PX,
  );
  // The width chosen stays stored; a narrow window only shows it narrower until it widens again.
  const sidebarMaxWidth = sidebarMaxFor(useWindowWidth());
  const sidebarWidth = Math.min(
    clampSidebarWidth(Number(storedWidth) || SIDEBAR_WIDTH_DEFAULT_PX),
    sidebarMaxWidth,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newSkill, setNewSkill] = useState<{ open: boolean; projectId: string | null }>({
    open: false,
    projectId: null,
  });
  const [presetDialog, setPresetDialog] = useState<{ open: boolean; preset: Preset | null }>({
    open: false,
    preset: null,
  });
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [sidebarHeaderSlot, setSidebarHeaderSlot] = useState<HTMLElement | null>(null);
  const [sidebarActionsSlot, setSidebarActionsSlot] = useState<HTMLElement | null>(null);
  const [takeoverSlot, setTakeoverSlot] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const [takeoverShown, setTakeoverShown] = useState(true);
  // Stable, so a page can claim in an effect without claiming again on every render.
  const claimSidebar = useCallback(() => {
    setClaims((count) => count + 1);
    setTakeoverShown(true);
    return () => setClaims((count) => count - 1);
  }, []);
  const takeover = useMemo<SidebarTakeover>(
    () => ({
      slot: takeoverSlot,
      active: claims > 0 && takeoverShown,
      claim: claimSidebar,
      setShown: setTakeoverShown,
    }),
    [claimSidebar, claims, takeoverShown, takeoverSlot],
  );

  const shell = useMemo<ShellActions>(
    () => ({
      openCommandPalette: () => setPaletteOpen(true),
      openSkillPicker: () => setSkillPickerOpen(true),
      openHelp: () => setHelpOpen(true),
      openPresetDialog: (preset) => setPresetDialog({ open: true, preset: preset ?? null }),
      openAddProject: () => setAddProjectOpen(true),
      openNewSkill: (projectId) => setNewSkill({ open: true, projectId: projectId ?? null }),
    }),
    [],
  );
  const slots = useMemo(
    () => ({
      title: titleSlot,
      actions: actionsSlot,
      sidebarHeader: sidebarHeaderSlot,
      sidebarActions: sidebarActionsSlot,
    }),
    [titleSlot, actionsSlot, sidebarHeaderSlot, sidebarActionsSlot],
  );

  useHotkey(SHORTCUT_KEYS.palette, (event) => {
    event.preventDefault();
    setPaletteOpen((open) => !open);
  });
  useHotkey(SHORTCUT_KEYS.quickOpen, (event) => {
    event.preventDefault();
    setPaletteOpen(false);
    setSkillPickerOpen((open) => !open);
  });
  useHotkey(SHORTCUT_KEYS.settings, (event) => {
    event.preventDefault();
    void navigate({ to: "/settings" });
  });

  return (
    <ShellContext.Provider value={shell}>
      <SidebarTakeoverContext.Provider value={takeover}>
        <PageHeaderSlotsContext.Provider value={slots}>
          <SidebarProvider
            open={sidebarOpen}
            onOpenChange={setSidebarOpen}
            className="h-svh min-h-0 flex-col overflow-hidden"
            style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
          >
            <TitleBar
              titleSlotRef={setTitleSlot}
              actionsSlotRef={setActionsSlot}
              sidebarHeaderRef={setSidebarHeaderSlot}
              sidebarActionsRef={setSidebarActionsSlot}
            />
            <div className="flex min-h-0 flex-1">
              <SidebarSlotRefContext.Provider value={setTakeoverSlot}>
                <AppSidebar
                  width={sidebarWidth}
                  maxWidth={sidebarMaxWidth}
                  onWidth={setSidebarWidth}
                />
              </SidebarSlotRefContext.Provider>
              <SidebarInset className="min-w-0 overflow-hidden">
                <CrashBanner />
                <LibraryWarningBanner />
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
              </SidebarInset>
            </div>
            <StatusBar />
          </SidebarProvider>

          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          <SkillPicker open={skillPickerOpen} onOpenChange={setSkillPickerOpen} />
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
          <NewSkillDialog
            open={newSkill.open}
            projectId={newSkill.projectId}
            onOpenChange={(open) => setNewSkill((previous) => ({ ...previous, open }))}
          />
          <FlaggedInstallDialog />
          <AddProjectDialog
            open={addProjectOpen}
            onOpenChange={setAddProjectOpen}
            onAdded={(project) =>
              void navigate({ to: "/projects/$projectId", params: { projectId: project.id } })
            }
          />
          <CloseDialog />
          <LibraryMissingDialog />
          <FirstRunDialog />
          <AppUpdateToast />
        </PageHeaderSlotsContext.Provider>
      </SidebarTakeoverContext.Provider>
    </ShellContext.Provider>
  );
}
