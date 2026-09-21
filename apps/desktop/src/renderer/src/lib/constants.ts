import { APP_SLUG } from "@loadout/shared";

/** Prefix for every localStorage key the renderer writes. */
export const STORAGE_PREFIX = `${APP_SLUG}:`;

/** Un-prefixed localStorage keys; always go through `usePersistedState`. */
export const STORAGE_KEYS = {
  sidebarOpen: "sidebar.open",
  sidebarGroups: "sidebar.groups",
  viewMode: "view-mode",
} as const;

/** Space kept free at the top-left on macOS for the window buttons. */
export const MAC_WINDOW_CONTROLS_WIDTH_PX = 76;
export const TOP_BAR_HEIGHT_CLASS = "h-12";

export const APP_UPDATE_CHECK_DELAY_MS = 3000;
export const SEARCH_DEBOUNCE_MS = 200;
export const QUERY_STALE_MS = 30_000;
export const TOAST_DURATION_MS = 4000;
/** Paths listed in a conflict toast before the rest is summarised as "+N more". */
export const TOAST_MAX_CONFLICT_PATHS = 4;

/** Agent avatars shown on a skill card before the rest collapse into a "+N" popover. */
export const AGENT_BADGE_MAX_VISIBLE = 6;
/** Tags shown on a skill card before "+N". */
export const SKILL_CARD_MAX_TAGS = 3;
export const DIFF_CONTEXT_LINES = 3;
export const COMMAND_PALETTE_MAX_SKILLS = 50;
/** Pointer travel before a sidebar item starts dragging, so plain clicks still navigate. */
export const DRAG_ACTIVATION_DISTANCE_PX = 6;

export const SIDEBAR_GROUP_IDS = ["agents", "assistants", "presets", "projects"] as const;
export type SidebarGroupId = (typeof SIDEBAR_GROUP_IDS)[number];

export const INSTALL_TABS = ["market", "local", "git", "scan"] as const;
export type InstallTab = (typeof INSTALL_TABS)[number];
export const DEFAULT_INSTALL_TAB: InstallTab = "market";

export const VIEW_MODES = ["grid", "list"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const DEFAULT_VIEW_MODE: ViewMode = "grid";

/** Special values of the tag filter next to real tag names. */
export const TAG_FILTER_UNTAGGED = "__untagged__";
