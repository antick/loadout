import { APP_NAME } from "@loadout/shared";

/** Longest device name the backend keeps. */
export const DEVICE_NAME_MAX_LENGTH = 64;

export const GITHUB_HOST = "github.com";
const GITHUB_WEB = `https://${GITHUB_HOST}`;
export const GITHUB_TOKENS_URL = `${GITHUB_WEB}/settings/tokens`;
/** Token form with the one scope the backup needs already ticked. */
export const GITHUB_NEW_TOKEN_URL = `${GITHUB_TOKENS_URL}/new?scopes=repo&description=${encodeURIComponent(`${APP_NAME} backup`)}`;
export const GITHUB_AUTHORIZED_APPS_URL = `${GITHUB_WEB}/settings/applications`;
/** Page of one authorised OAuth app, where its access can be revoked. */
export const githubOauthAppUrl = (clientId: string): string =>
  `${GITHUB_WEB}/settings/connections/applications/${encodeURIComponent(clientId)}`;
export const REPO_DANGER_ZONE_PATH = "/settings#danger-zone";
export const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";

/** GitHub repository names: letters, digits, dot, dash, underscore. */
export const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** GitHub asks for at least this long between sign-in polls. */
export const DEVICE_POLL_MIN_INTERVAL_S = 5;
/** Added to the interval every time GitHub answers "slow down". */
export const DEVICE_POLL_SLOW_DOWN_S = 5;
export const MS_PER_SECOND = 1000;

/** A public backup repository is worth a long look. */
export const PUBLIC_REPO_WARNING_MS = 15_000;
/** Characters of a commit id shown in the history. */
export const SHORT_COMMIT_LENGTH = 8;
/** Oversized skills listed before the rest is summarised. */
export const MAX_LISTED_OVERSIZED = 5;
