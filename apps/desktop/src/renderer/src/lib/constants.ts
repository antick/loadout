import { APP_SLUG } from "@loadout/shared";

/** Prefix for every localStorage key the renderer writes. */
export const STORAGE_PREFIX = `${APP_SLUG}:`;
/** Local copy of the palette and mode, read before the first paint. */
export const APPEARANCE_STORAGE_KEY = `${STORAGE_PREFIX}appearance`;

/** Un-prefixed localStorage keys; always go through `usePersistedState`. */
export const STORAGE_KEYS = {
  sidebarOpen: "sidebar.open",
  sidebarGroups: "sidebar.groups",
  sidebarSection: "sidebar.section",
  sidebarWidth: "sidebar.width",
  sidebarProjectsOpen: "sidebar.projects-open",
  viewMode: "view-mode",
  editorView: "editor.view",
  editorWrap: "editor.wrap",
  editorSplit: "editor.split",
} as const;

/** localStorage prefix of unsaved editor drafts: `<prefix><skillId>:<path>`. */
/** File type "Export as .zip" saves, and the name an export of several skills starts with. */
export const EXPORT_FILE_EXTENSION = ".zip";
export const EXPORT_MANY_PREFIX = `${APP_SLUG}-skills-`;

export const EDITOR_DRAFT_PREFIX = "editor.draft:";
/** Quiet time before an unsaved draft is written to localStorage. */
export const EDITOR_DRAFT_SAVE_MS = 400;
/** Drafts older than this are dropped instead of restored. */
export const EDITOR_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const EDITOR_VIEWS = ["edit", "split", "preview"] as const;
export type EditorView = (typeof EDITOR_VIEWS)[number];
export const DEFAULT_EDITOR_VIEW: EditorView = "split";
/** Share of the text in the editor-and-preview layout, in percent, and how far a drag may take it. */
export const EDITOR_SPLIT_DEFAULT_PERCENT = 50;
export const EDITOR_SPLIT_MIN_PERCENT = 20;
export const EDITOR_SPLIT_MAX_PERCENT = 80;
/** One arrow-key press on the split's edge moves it by this much. */
export const EDITOR_SPLIT_STEP_PERCENT = 5;
/** Least either side of the split keeps: its width side by side, its height stacked. */
export const EDITOR_PANE_MIN_WIDTH_PX = 280;
export const EDITOR_PANE_MIN_HEIGHT_PX = 160;

/**
 * Space kept free at the top-left on macOS for the window buttons. At the main process's
 * `TRAFFIC_LIGHT_POSITION` they end 77px from the left edge; 96 leaves the ~20px gap macOS keeps
 * between the buttons and a title.
 */
export const MAC_WINDOW_CONTROLS_WIDTH_PX = 96;
export const TOP_BAR_HEIGHT_CLASS = "h-12";
/** Width of the activity bar, the icon strip at the far left beside the sidebar. */
export const ACTIVITY_BAR_WIDTH_PX = 68;
export const STATUS_BAR_HEIGHT_CLASS = "h-7";
/** Sidebar width: what it starts at, and how far dragging its edge may take it. */
export const SIDEBAR_WIDTH_DEFAULT_PX = 256;
export const SIDEBAR_WIDTH_MIN_PX = 200;
export const SIDEBAR_WIDTH_MAX_PX = 440;
/**
 * Width the page keeps beside the sidebar. A narrow window shows the sidebar narrower (down to
 * its minimum) rather than squeezing the page; the width you chose comes back as it widens.
 */
export const PAGE_MIN_WIDTH_PX = 600;
/** One arrow-key press on the sidebar's edge moves it by this much. */
export const SIDEBAR_WIDTH_STEP_PX = 16;
/** Skills listed under "Recently changed" in the library panel. */
export const SIDEBAR_RECENT_SKILLS = 5;

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

/** Collapsible groups inside the sidebar sections; their open state is remembered. */
export const SIDEBAR_GROUP_IDS = ["agents", "assistants"] as const;
export type SidebarGroupId = (typeof SIDEBAR_GROUP_IDS)[number];

export const INSTALL_TABS = ["market", "local", "git", "scan"] as const;
export type InstallTab = (typeof INSTALL_TABS)[number];
export const DEFAULT_INSTALL_TAB: InstallTab = "market";

export const VIEW_MODES = ["grid", "list"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const DEFAULT_VIEW_MODE: ViewMode = "grid";

/** Special values of the tag filter next to real tag names. */
export const TAG_FILTER_UNTAGGED = "__untagged__";
