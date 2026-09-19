import type { InstallTab } from "@/lib/constants";
import type { MarketBoard } from "@skillboard/shared";

export const MARKET_BOARDS = [
  "hot",
  "trending",
  "all_time",
] as const satisfies readonly MarketBoard[];
export const DEFAULT_MARKET_BOARD: MarketBoard = "hot";

/** Board results shown per page; boards arrive whole, so paging is done here. */
export const MARKET_PAGE_SIZE = 24;
/** Search asks for this many results, and "Load more" raises the limit by the same step. */
export const MARKET_SEARCH_LIMIT_STEP = 40;
/** The marketplace never returns more than this for one search. */
export const MARKET_SEARCH_LIMIT_MAX = 200;
/** Shorter queries show the board instead of searching. */
export const MARKET_SEARCH_MIN_CHARS = 2;
/** Longer than the in-page search debounce because each change is a network request. */
export const MARKET_SEARCH_DEBOUNCE_MS = 350;
export const MARKET_SKELETON_COUNT = 12;
export const SCAN_SKELETON_COUNT = 5;
/** Stat cards at the top of the Scan tab, for its skeleton. */
export const SCAN_STAT_COUNT = 4;

/** Value of the contributor filter that means "no filter". */
export const SOURCE_FILTER_ALL = "__all__";

/** Shown under the Git URL field; clicking one fills the field. Not translated: they are syntax. */
export const GIT_URL_EXAMPLES = [
  "owner/repo",
  "https://github.com/owner/repo",
  "https://github.com/owner/repo/tree/main/skills/my-skill",
  "git@github.com:owner/repo.git",
] as const;

/** Archive types the installer accepts, for the option card's hint. */
export const ARCHIVE_EXTENSIONS = [".zip", ".skill"] as const;

/** Errors listed in a batch result before the rest collapse into "and N more". */
export const BATCH_ERRORS_MAX_VISIBLE = 5;
/** Folders listed under a discovered skill before "and N more". */
export const SCAN_LOCATIONS_MAX_VISIBLE = 3;

/** How long the success toast stays, longer than the default so its actions can be reached. */
export const INSTALL_SUCCESS_TOAST_MS = 8000;

export const INSTALL_TAB_ORDER: readonly InstallTab[] = ["market", "local", "git", "scan"];
