import type { Download, DownloadOptions } from "./download";

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
/**
 * Hosting domains where every subdomain belongs to someone else (`alice.github.io` and
 * `bob.github.io` are two people): the site is the full subdomain there.
 */
const SHARED_HOSTING: ReadonlySet<string> = new Set([
  "github.io",
  "gitlab.io",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "herokuapp.com",
  "onrender.com",
  "fly.dev",
  "azurewebsites.net",
  "cloudfront.net",
  "amazonaws.com",
  "blob.core.windows.net",
  "surge.sh",
  "glitch.me",
  "replit.app",
]);

/** The registrable part of a host name, e.g. `downloads.example.co.uk` → `example.co.uk`. */
export function siteOf(host: string): string {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (IPV4.test(name) || name.includes(":")) return name;
  const labels = name.split(".");
  const country = labels.at(-1)?.length === COUNTRY_TLD_LENGTH;
  const keep = country && COUNTRY_SECOND_LEVELS.has(labels.at(-2) ?? "") ? 3 : 2;
  const site = labels.slice(-keep).join(".");
  const shared = [...SHARED_HOSTING].find(
    (suffix) => name === suffix || name.endsWith(`.${suffix}`),
  );
  if (shared && name !== shared) {
    return labels.slice(-(shared.split(".").length + 1)).join(".");
  }
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

/** Download with every hop watched; says which other site, if any, the file finally came from. */
export async function downloadWatched(
  download: Download,
  link: string,
  options: DownloadOptions,
): Promise<{ data: Buffer; redirectedTo: string | null }> {
  let final = link;
  const data = await download(link, {
    ...options,
    onRedirect: (to) => {
      final = to;
    },
  });
  return { data, redirectedTo: crossSiteHost(link, final) };
}
