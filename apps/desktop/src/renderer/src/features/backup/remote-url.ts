import { GITHUB_HOST, normalizeSourceUrl } from "@loadout/shared";

/** A remote in its one spelling, `host/owner/repo`; null when it is not a host and a path. */
function hostAndPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const normalized = normalizeSourceUrl(url);
  const [host, ...rest] = normalized.split("/");
  return host && !host.includes(" ") && rest.length > 0 ? normalized : null;
}

export function isGithubRemote(url: string | null | undefined): boolean {
  return hostAndPath(url)?.startsWith(`${GITHUB_HOST}/`) ?? false;
}

/** The repository's web page, or null when the remote is not something a browser can open. */
export function remoteWebUrl(url: string | null | undefined): string | null {
  const remote = hostAndPath(url);
  return remote ? `https://${remote}` : null;
}
