/** The small capitals over a group: section headings, list headers, collapsible group titles. */
export const SECTION_LABEL = "text-xs font-medium tracking-wider text-muted-foreground uppercase";

/*
 * Card grids: as many columns as fit, each at least as wide as its cards need. Written out whole
 * so Tailwind finds the classes.
 */
/** Library skills, agents, presets and projects. */
export const CARD_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3";
/** Marketplace results: a little narrower, as they carry less. */
export const MARKET_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3";
/** Skills in an agent's or a project's folder, with their status line. */
export const LOCAL_SKILL_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3";
/** Source cards, with their location and actions. */
export const SOURCE_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(24rem,1fr))] gap-3";
/** The compact list of switched-off agents: columns only, the list sets its own spacing. */
export const AGENT_LIST_COLUMNS_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]";

/** The scrolling body of a dialog with a long form or list: the buttons stay in view. */
export const DIALOG_BODY_SCROLL_CLASS = "max-h-[60vh] overflow-y-auto";
/** A dialog that is all content (help, duplicates): as tall as the window allows. */
export const DIALOG_TALL_CLASS = "max-h-[85vh]";
