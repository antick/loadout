import { posix } from "node:path";
import { isArchivePath } from "./archive";

/**
 * Links to a file on the web: an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`) or a lone
 * `SKILL.md`. Recognised by the path of the URL alone, so a query string (`?download=1`) or a
 * fragment does not hide it, and a repository URL never matches.
 */

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["https:", "http:"]);
const SKILL_FILE = "skill.md";
/** Pages that show a file rather than serve it; Git sources read those. */
const FILE_PAGE_HOSTS: ReadonlySet<string> = new Set(["github.com", "www.github.com"]);
const GITLAB_FILE_PAGE = "/-/blob/";

function parse(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

function decodedPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

/** The trimmed link when `input` points at an archive over http(s); null otherwise. */
export function archiveLink(input: string): string | null {
  const url = parse(input);
  if (!url || !WEB_PROTOCOLS.has(url.protocol)) return null;
  return isArchivePath(decodedPath(url)) ? input.trim() : null;
}

/**
 * The trimmed link when `input` points at a `SKILL.md` served as a file over http(s); null
 * otherwise. A GitHub or GitLab page showing the file is a repository link, not this.
 */
export function skillFileLink(input: string): string | null {
  const url = parse(input);
  if (!url || !WEB_PROTOCOLS.has(url.protocol)) return null;
  if (FILE_PAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const path = decodedPath(url);
  if (path.includes(GITLAB_FILE_PAGE)) return null;
  return posix.basename(path).toLowerCase() === SKILL_FILE ? input.trim() : null;
}

/** File name of the archive a link points at, e.g. `pdf-tools.zip`. */
export function archiveLinkName(link: string): string {
  const url = parse(link);
  return url ? posix.basename(decodedPath(url)) : link;
}
