import {
  CLAWHUB_NAME,
  CLAWHUB_URL,
  MARKETPLACE_NAME,
  MARKETPLACE_URL,
  type MarketBoard,
  type MarketProvider,
} from "@loadout/shared";

/** The first board of each marketplace. */
export const DEFAULT_MARKET_BOARD_OF: Record<MarketProvider, MarketBoard> = {
  skills_sh: "hot",
  clawhub: "trending",
};
export const MARKET_PROVIDER_NAMES: Record<MarketProvider, string> = {
  skills_sh: MARKETPLACE_NAME,
  clawhub: CLAWHUB_NAME,
};
export const MARKET_PROVIDER_URLS: Record<MarketProvider, string> = {
  skills_sh: MARKETPLACE_URL,
  clawhub: CLAWHUB_URL,
};

/** Board results shown at first and added by each "Show more"; boards arrive whole. */
export const MARKET_PAGE_SIZE = 24;
/** Search asks for this many results, and "Show more" raises the limit by the same step. */
export const MARKET_SEARCH_LIMIT_STEP = 40;
/** The marketplace never returns more than this for one search. */
export const MARKET_SEARCH_LIMIT_MAX = 200;
/** Shorter queries show the board instead of searching. */
export const MARKET_SEARCH_MIN_CHARS = 2;
/** Longer than the in-page search debounce because each change is a network request. */
export const MARKET_SEARCH_DEBOUNCE_MS = 350;
export const MARKET_SKELETON_COUNT = 12;
export const SCAN_SKELETON_COUNT = 5;

/** Shown under the Git URL field; clicking one fills the field. Not translated: they are syntax. */
export const GIT_URL_EXAMPLES = [
  "owner/repo",
  "owner/repo@my-skill",
  "https://github.com/owner/repo/tree/main/skills/my-skill",
  "git@github.com:owner/repo.git",
  "https://example.com/my-skill.zip",
  "npx skills add owner/repo --skill my-skill",
] as const;

/** Where to get Git, offered when it is missing. */
export const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";

/** Errors listed in a batch result before the rest collapse into "and N more". */
export const BATCH_ERRORS_MAX_VISIBLE = 5;
/** Folders listed under a discovered skill before "and N more". */
export const SCAN_LOCATIONS_MAX_VISIBLE = 3;

/** How long the success toast stays, longer than the default so its actions can be reached. */
export const INSTALL_SUCCESS_TOAST_MS = 8000;
