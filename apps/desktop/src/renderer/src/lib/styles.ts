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
