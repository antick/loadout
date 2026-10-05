import { redactUrl } from "@loadout/shared";
import { PRIVATE_KEY_BLOCK, SECRET_PATTERNS } from "../util/secret-patterns";

/** `Bearer …` and `Authorization: token|Basic …` values, whatever the credential looks like. */
const AUTH_HEADER_VALUES = /\b(Bearer|Authorization:\s*(?:token|Basic))\s+[A-Za-z0-9._~+/=-]{8,}/gi;
/** `?token=…`, `&api_key=…` and the like in URLs. */
const SECRET_QUERY_VALUES =
  /([?&](?:access_token|token|api_key|apikey|key|secret|password|sig|signature)=)[^&#\s]+/gi;
const EMAILS = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const USER_FOLDERS = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\:"']+/g;

const REDACTED_CREDENTIALS = "<redacted>@";
const REDACTED_TOKEN = "<token>";
const REDACTED_EMAIL = "<email>";
const HOME_MARK = "~";

/**
 * Strip what identifies the user before text leaves the machine in a bug report: the home folder,
 * credentials embedded in URLs, access tokens and email addresses.
 */
export function sanitizeText(text: string, homeDir: string): string {
  const withoutHome = homeDir ? text.split(homeDir).join(HOME_MARK) : text;
  const scrubbed = redactUrl(withoutHome.replace(USER_FOLDERS, HOME_MARK), REDACTED_CREDENTIALS)
    .replace(PRIVATE_KEY_BLOCK, REDACTED_TOKEN)
    .replace(SECRET_QUERY_VALUES, `$1${REDACTED_TOKEN.slice(1, -1)}`)
    .replace(AUTH_HEADER_VALUES, `$1 ${REDACTED_TOKEN}`)
    .replace(EMAILS, REDACTED_EMAIL);
  return SECRET_PATTERNS.reduce((out, { regex }) => out.replace(regex, REDACTED_TOKEN), scrubbed);
}
