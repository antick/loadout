/**
 * Whether a download that was redirected ended up on another site. A move within one site
 * (`github.com` to `codeload.github.com`) is normal and never asked about; a move to another site
 * is shown before anything is installed, because the link no longer says where the files come from.
 */

/** Second-level labels under which country domains register names (`example.co.uk`). */
const COUNTRY_SECOND_LEVELS: ReadonlySet<string> = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "or",
  "org",
]);
const COUNTRY_TLD_LENGTH = 2;
/** Sites that serve their downloads from a second domain of their own. */
const SAME_OWNER: Readonly<Record<string, string>> = {
  "githubusercontent.com": "github.com",
};
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** The registrable part of a host name, e.g. `downloads.example.co.uk` → `example.co.uk`. */
export function siteOf(host: string): string {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (IPV4.test(name) || name.includes(":")) return name;
  const labels = name.split(".");
  const country = labels.at(-1)?.length === COUNTRY_TLD_LENGTH;
  const keep = country && COUNTRY_SECOND_LEVELS.has(labels.at(-2) ?? "") ? 3 : 2;
  const site = labels.slice(-keep).join(".");
  return SAME_OWNER[site] ?? site;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** The host `to` is on when it is another site than `from`; null when both are the same site. */
export function crossSiteHost(from: string, to: string): string | null {
  const start = hostOf(from);
  const end = hostOf(to);
  if (!start || !end) return end;
  return siteOf(start) === siteOf(end) ? null : end;
}
