import { GITHUB_HOST } from "./constants";

const SCP_LIKE = /^[^@/\s]+@([^:/\s]+):(.+)$/;

interface RemoteParts {
  host: string;
  /** `owner/repo`, without `.git`. */
  path: string;
}

const clean = (path: string): string => path.replace(/^\/+/, "").replace(/\.git\/?$/, "");

/** Host and repository path of an https, ssh or `git@host:owner/repo` remote. */
function parseRemote(url: string): RemoteParts | null {
  const text = url.trim();
  const scp = SCP_LIKE.exec(text);
  if (scp?.[1] && scp[2]) return { host: scp[1].toLowerCase(), path: clean(scp[2]) };
  try {
    const parsed = new URL(text);
    return { host: parsed.hostname.toLowerCase(), path: clean(parsed.pathname) };
  } catch {
    return null;
  }
}

export function isGithubRemote(url: string | null | undefined): boolean {
  return url ? parseRemote(url)?.host === GITHUB_HOST : false;
}

/** The repository's web page, or null when the remote is not something a browser can open. */
export function remoteWebUrl(url: string | null | undefined): string | null {
  const parts = url ? parseRemote(url) : null;
  return parts?.path ? `https://${parts.host}/${parts.path}` : null;
}
