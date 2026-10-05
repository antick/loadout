import { APP_NAME, GITHUB_HOST, PREVIEW_SEARCH_MIN_SKILLS } from "@loadout/shared";

const GITHUB_WEB = `https://${GITHUB_HOST}`;
export const GITHUB_TOKENS_URL = `${GITHUB_WEB}/settings/tokens`;
/** Token form with the one scope the backup needs already ticked. */
export const GITHUB_NEW_TOKEN_URL = `${GITHUB_TOKENS_URL}/new?scopes=repo&description=${encodeURIComponent(`${APP_NAME} backup`)}`;
export const GITHUB_AUTHORIZED_APPS_URL = `${GITHUB_WEB}/settings/applications`;
export const REPO_DANGER_ZONE_PATH = "/settings#danger-zone";
export const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";

/** GitHub asks for at least this long between sign-in polls. */
export const DEVICE_POLL_MIN_INTERVAL_S = 5;
/** Added to the interval every time GitHub answers "slow down". */
export const DEVICE_POLL_SLOW_DOWN_S = 5;
export const MS_PER_SECOND = 1000;

/** Characters of a commit id shown in the history. */
export const SHORT_COMMIT_LENGTH = 8;
/** Oversized skills listed before the rest is summarised. */
export const MAX_LISTED_OVERSIZED = 5;
/** A sync review this long gets a search; the same point as the install list. */
export const REVIEW_SEARCH_MIN_ITEMS = PREVIEW_SEARCH_MIN_SKILLS;
