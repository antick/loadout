import type { Preset, Skill } from "@loadout/shared";
import { createContext, useContext } from "react";

/** App-wide dialogs owned by the shell. Any page can open them through `useShell()`. */
export interface ShellActions {
  openCommandPalette(): void;
  openHelp(): void;
  /**
   * Create a preset, or edit the one given. A new preset made with `adding` gets those skills and
   * the user stays where they are; one made from nothing opens its page.
   */
  openPresetDialog(preset?: Preset | null, adding?: NewPresetSkills): void;
  /**
   * Start a new skill, in the library or straight in the project given; the editor opens once it
   * is created.
   */
  openNewSkill(projectId?: string): void;
  /** Rename a library skill everywhere it is deployed. */
  openRenameSkill(skill: Skill): void;
  /** Upload a library skill as a version on ClawHub. */
  openPublishToClawhub(skill: Skill): void;
  openAddProject(): void;
}

/** Skills a new preset starts with, and what to do once they are in it. */
export interface NewPresetSkills {
  skillIds: readonly string[];
  onAdded?: () => void;
}

export interface PageHeaderSlots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  /** Title-bar cell above the sidebar, where the sidebar section puts its name and action. */
  sidebarHeader: HTMLElement | null;
  /** Next to the sidebar toggle: the section's buttons while the sidebar is folded away. */
  sidebarActions: HTMLElement | null;
}

export const ShellContext = createContext<ShellActions | null>(null);
/** DOM nodes inside the title bar that `<PageHeader>` and `<SidebarPanel>` portal into. */
export const PageHeaderSlotsContext = createContext<PageHeaderSlots>({
  title: null,
  actions: null,
  sidebarHeader: null,
  sidebarActions: null,
});

/** Open the shell's dialogs (command palette, help, preset editor, link project). */
export function useShell(): ShellActions {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside <AppShell>.");
  return shell;
}

/**
 * A page that lists its own things in the sidebar (the editor's files) in place of the section.
 * The page claims it while mounted; picking a section in the activity bar hides it again.
 */
export interface SidebarTakeover {
  /** Where the page portals its sidebar content; null while nothing is shown. */
  slot: HTMLElement | null;
  /** A page has claimed the sidebar and it is not hidden: the section list steps aside. */
  active: boolean;
  /** Claim the sidebar for the calling page. Returns the release function. */
  claim(): () => void;
  /** Show or hide the page's content (hidden: the section list is back). */
  setShown(shown: boolean): void;
}

export const SidebarTakeoverContext = createContext<SidebarTakeover>({
  slot: null,
  active: false,
  claim: () => () => undefined,
  setShown: () => undefined,
});

/** The slot the sidebar offers a page. Used by `AppSidebar` to host it. */
export const SidebarSlotRefContext = createContext<(node: HTMLElement | null) => void>(
  () => undefined,
);

export function useSidebarTakeover(): SidebarTakeover {
  return useContext(SidebarTakeoverContext);
}
