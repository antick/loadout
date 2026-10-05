import { redactUrl } from "@loadout/shared";
import { invalid } from "../errors";
import { type Download, type DownloadOptions, parseUrl } from "./download";

/**
 * Whether a download that was redirected went to another site. A move within one site
 * (`github.com` to `codeload.github.com`) is normal and never asked about; a move to another site
 * is shown before anything is installed, because the link no longer says where the files come from.
 */

/*
 * The site rule, as data: which hosts count as one site. `COUNTRY_SECOND_LEVELS` and
 * `SHARED_HOSTING` decide how many labels of a host name make the site; `SAME_OWNER` folds a
 * download domain into the site that owns it.
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
  return parseUrl(url)?.hostname ?? null;
}

/** The host `to` is on when it is another site than `from`; null when both are the same site. */
export function crossSiteHost(from: string, to: string): string | null {
  const start = hostOf(from);
  const end = hostOf(to);
  if (!start || !end) return end;
  return siteOf(start) === siteOf(end) ? null : end;
}

/**
 * The one rule for where a download may go, the same at install and at every update: each hop
 * stays on the site of the address it started from, or on one other site, and never goes from
 * https to plain http. An install learns that other site from the first hop that leaves (the user
 * is asked about it before anything is installed) and refuses a second one; an update knows it
 * from the install and refuses any other. Several downloads of one source share one rule.
 */
export interface RedirectRule {
  /** The `onRedirect` of one download of `link`: throws on a hop the rule refuses. */
  watch(link: string): (to: string) => void;
  /** Host of the other site the downloads moved to, or were agreed to; null when none. */
  otherHost(): string | null;
}

/**
 * At install, `agreed` is what an earlier download of the same source already moved to (still
 * to be confirmed), or null; at an update it is the host the user agreed to at install.
 */
export function redirectRule(phase: "install" | "update", agreed: string | null): RedirectRule {
  let other = agreed;
  return {
    otherHost: () => other,
    watch: (link) => (to) => {
      const shown = redactUrl(link);
      if (parseUrl(link)?.protocol === "https:" && parseUrl(to)?.protocol === "http:") {
        throw invalid(
          phase === "update"
            ? `${shown} now leads to an unencrypted http address, so it was not updated.`
            : `${shown} leads to an unencrypted http address, so it was not downloaded.`,
        );
      }
      const host = crossSiteHost(link, to);
      if (!host || (other && siteOf(host) === siteOf(other))) return;
      if (phase === "update") {
        throw invalid(
          `${shown} now leads to ${host}. Install it again from Install to trust that site.`,
        );
      }
      if (other) {
        throw invalid(
          `${shown} moves on to ${host} after ${other}. Loadout follows a download to one other site at most.`,
        );
      }
      other = host;
    },
  };
}

/** Download with every hop watched by `rule`; says which other site, if any, it moved to. */
export async function downloadWatched(
  download: Download,
  link: string,
  options: DownloadOptions,
  rule: RedirectRule = redirectRule("install", null),
): Promise<{ data: Buffer; redirectedTo: string | null }> {
  const data = await download(link, { ...options, onRedirect: rule.watch(link) });
  return { data, redirectedTo: rule.otherHost() };
}
