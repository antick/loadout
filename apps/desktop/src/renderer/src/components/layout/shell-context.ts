import type { Preset } from "@loadout/shared";
import { createContext, useContext } from "react";

/** App-wide dialogs owned by the shell. Any page can open them through `useShell()`. */
export interface ShellActions {
  openCommandPalette(): void;
  openHelp(): void;
  /** Create a preset, or edit the one given. */
  openPresetDialog(preset?: Preset): void;
  openAddProject(): void;
}

export interface PageHeaderSlots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
}

export const ShellContext = createContext<ShellActions | null>(null);
/** DOM nodes inside the top bar that `<PageHeader>` portals into. */
export const PageHeaderSlotsContext = createContext<PageHeaderSlots>({
  title: null,
  actions: null,
});

/** Open the shell's dialogs (command palette, help, preset editor, link project). */
export function useShell(): ShellActions {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside <AppShell>.");
  return shell;
}
