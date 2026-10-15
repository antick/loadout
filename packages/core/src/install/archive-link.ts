import { posix } from "node:path";
import { SKILL_MARKER_FILES, isArchivePath } from "@loadout/shared";
import { invalid } from "../errors";
import { WEB_PROTOCOLS, parseUrl } from "./download";

/**
 * Links to a file on the web: an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`) or a lone
 * `SKILL.md`. Recognised by the path of the URL alone, so a query string (`?download=1`) or a
 * fragment does not hide it, and a repository URL never matches.
 */

/** Pages that show a file rather than serve it; Git sources read those. */
const FILE_PAGE_HOSTS: ReadonlySet<string> = new Set(["github.com", "www.github.com"]);
const GITLAB_FILE_PAGE = "/-/blob/";
const CREDENTIALS_NOT_ALLOWED =
  "Leave the user name, password or token out of the link. It would be stored, shown and backed up with the skill. Use a link that downloads without signing in.";

function decodedPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

/** The web link `input` parses to, refusing one that carries credentials as Git input does. */
function webUrl(input: string): URL | null {
  const url = parseUrl(input);
  if (!url || !WEB_PROTOCOLS.has(url.protocol)) return null;
  if (url.username || url.password) throw invalid(CREDENTIALS_NOT_ALLOWED);
  return url;
}

/**
 * The trimmed link when `input` points at an archive over http(s); null otherwise. Throws
 * INVALID_INPUT for one with a user name or password in it.
 */
export function archiveLink(input: string): string | null {
  const url = webUrl(input);
  if (!url) return null;
  return isArchivePath(decodedPath(url)) ? input.trim() : null;
}

/**
 * The trimmed link when `input` points at a `SKILL.md` served as a file over http(s); null
 * otherwise. A GitHub or GitLab page showing the file is a repository link, not this. Throws
 * INVALID_INPUT for one with a user name or password in it.
 */
export function skillFileLink(input: string): string | null {
  const url = webUrl(input);
  if (!url) return null;
  if (FILE_PAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const path = decodedPath(url);
  if (path.includes(GITLAB_FILE_PAGE)) return null;
  const name = posix.basename(path).toLowerCase();
  return SKILL_MARKER_FILES.some((marker) => marker.toLowerCase() === name) ? input.trim() : null;
}

/** File name of the archive a link points at, e.g. `pdf-tools.zip`. */
export function archiveLinkName(link: string): string {
  const url = parseUrl(link);
  return url ? posix.basename(decodedPath(url)) : link;
}
