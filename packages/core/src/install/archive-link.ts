import { posix } from "node:path";
import { isArchivePath } from "./archive";

/**
 * Links to an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`) on the web. Recognised by the path of the URL alone, so a
 * query string (`?download=1`) or a fragment does not hide it, and a repository URL never matches.
 */

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["https:", "http:"]);

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

/** File name of the archive a link points at, e.g. `pdf-tools.zip`. */
export function archiveLinkName(link: string): string {
  const url = parse(link);
  return url ? posix.basename(decodedPath(url)) : link;
}
