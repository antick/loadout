const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const TOKENS =
  /\b(?:gh[psuro]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9_-]{8,}|xox[a-z]-[A-Za-z0-9-]{8,})/g;
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
  return withoutHome
    .replace(USER_FOLDERS, HOME_MARK)
    .replace(URL_CREDENTIALS, `$1${REDACTED_CREDENTIALS}`)
    .replace(TOKENS, REDACTED_TOKEN)
    .replace(EMAILS, REDACTED_EMAIL);
}
