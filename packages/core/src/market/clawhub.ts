import {
  APP_SLUG,
  CLAWHUB_API_URL,
  CLAWHUB_NAME,
  type MarketAudit,
  type MarketBoard,
  type MarketSkill,
  type MarketSkillDetail,
  clawhubMarketId,
  clawhubSkillUrl,
} from "@loadout/shared";
import { AppError, errorMessage, invalid, notFound } from "../errors";

/**
 * The ClawHub registry (clawhub.ai): public read endpoints, no token. Skills are versioned and
 * served as zip files by ClawHub itself; a slug can exist under several publishers, so a skill
 * is always named `owner/slug`.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const LIST_LIMIT = 50;
const MAX_SEARCH_LIMIT = 200;
/** Sort each board asks the registry for. */
const BOARD_SORTS: Partial<Record<MarketBoard, string>> = {
  trending: "trending",
  downloads: "downloads",
  newest: "createdAt",
};
/** ClawHub's own files inside a download, not part of the skill. */
export const CLAWHUB_META_FILES: ReadonlySet<string> = new Set(["_meta.json"]);

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const asText = (value: unknown): string | null => (typeof value === "string" ? value : null);
const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A published skill as the registry lists it. */
export type ClawhubEntry = Omit<MarketSkill, "installed">;

export interface ClawhubDetail extends MarketSkillDetail {
  owner: string;
  slug: string;
}

export interface ClawhubClient {
  list(board: MarketBoard): Promise<ClawhubEntry[]>;
  search(query: string, limit: number): Promise<ClawhubEntry[]>;
  /** The skill, its latest version and its SKILL.md. With `owner` unset, the registry's first match. */
  detail(owner: string | null, slug: string): Promise<ClawhubDetail>;
  /** Security scan of the version, as audits; null when the scan could not be read. */
  audits(owner: string, slug: string): Promise<MarketAudit[] | null>;
  /** The latest version's number. */
  latestVersion(owner: string, slug: string): Promise<string>;
  /** The zip of one version. */
  download(owner: string, slug: string, version: string, signal?: AbortSignal): Promise<Buffer>;
}

export interface ClawhubClientDeps {
  fetchImpl?: typeof fetch;
}

/** `owner/slug` → both parts; refused when either is missing or odd. */
export function parseClawhubRef(ref: string): { owner: string; slug: string } {
  const [owner, slug, ...rest] = ref.replace(/^@/, "").split("/");
  if (!owner || !slug || rest.length > 0 || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(slug)) {
    throw invalid(`Invalid ${CLAWHUB_NAME} skill: '${ref}'. Expected owner/slug.`);
  }
  return { owner, slug };
}

function entryOf(raw: unknown): ClawhubEntry | null {
  const item = asObject(raw);
  const slug = asText(item.slug);
  const owner = asText(item.ownerHandle) ?? asText(asObject(item.owner).handle);
  if (!slug || !owner) return null;
  const stats = asObject(item.stats);
  const latest = asObject(item.latestVersion);
  return {
    provider: "clawhub",
    id: clawhubMarketId(owner, slug),
    skillId: slug,
    name: asText(item.displayName) || slug,
    source: owner,
    installs:
      asNumber(stats.installs) ?? asNumber(stats.downloads) ?? asNumber(item.downloads) ?? 0,
    summary: asText(item.summary),
    version: asText(latest.version) ?? asText(item.version),
  };
}

const SCAN_STATUSES: Record<string, MarketAudit["status"]> = {
  clean: "pass",
  benign: "pass",
  suspicious: "warn",
  malicious: "fail",
};

/** `?a=b&c=d` from the params that are set. */
function query(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function createClawhubClient(deps: ClawhubClientDeps = {}): ClawhubClient {
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function request(path: string, accept: string, timeoutMs = REQUEST_TIMEOUT_MS) {
    let response: Response;
    try {
      response = await fetchImpl(`${CLAWHUB_API_URL}${path}`, {
        headers: { "User-Agent": APP_SLUG, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AppError("TIMEOUT", `${CLAWHUB_NAME} did not answer in time`);
      }
      throw new AppError("NETWORK", `Could not reach ${CLAWHUB_NAME}: ${errorMessage(error)}`);
    }
    return response;
  }

  async function json(path: string): Promise<{ status: number; body: Json }> {
    const response = await request(path, "application/json");
    let body: Json = {};
    try {
      body = asObject(await response.json());
    } catch {
      if (response.ok)
        throw new AppError("NETWORK", `The ${CLAWHUB_NAME} answer could not be read`);
    }
    if (response.status === 404) throw notFound(asText(body.message) ?? `Not on ${CLAWHUB_NAME}`);
    if (response.status === 429) {
      throw new AppError("NETWORK", `${CLAWHUB_NAME} is rate limiting requests; try again later`);
    }
    if (!response.ok && response.status !== 409) {
      throw new AppError("NETWORK", `${CLAWHUB_NAME} answered with HTTP ${response.status}`);
    }
    return { status: response.status, body };
  }

  async function detail(owner: string | null, slug: string): Promise<ClawhubDetail> {
    const { status, body } = await json(`/skills/${encodeURIComponent(slug)}${query({ owner })}`);
    if (status === 409) {
      // Several publishers use the slug: without a chosen one, the registry's first (most used).
      const matches = Array.isArray(body.matches) ? body.matches : [];
      const first = asText(asObject(matches[0]).ownerHandle);
      if (!first || owner) throw invalid(`${CLAWHUB_NAME} has several skills called ${slug}`);
      return detail(first, slug);
    }
    const skill = asObject(body.skill);
    const foundOwner = asText(asObject(body.owner).handle) ?? owner;
    const foundSlug = asText(skill.slug) ?? slug;
    if (!foundOwner) throw notFound(`${slug} has no publisher on ${CLAWHUB_NAME}`);
    const latest = asObject(body.latestVersion);
    const version = asText(latest.version);
    const document = asText(skill.description);
    return {
      provider: "clawhub",
      id: clawhubMarketId(foundOwner, foundSlug),
      owner: foundOwner,
      slug: foundSlug,
      source: foundOwner,
      skillId: foundSlug,
      pageUrl: clawhubSkillUrl(foundOwner, foundSlug),
      repoUrl: null,
      version,
      changelog: asText(latest.changelog),
      audits: null,
      document: document && document.trim() ? document : null,
      documentPath: document ? "SKILL.md" : null,
    };
  }

  return {
    list: async (board) => {
      const sort = BOARD_SORTS[board];
      if (!sort) throw invalid(`Unknown ${CLAWHUB_NAME} board: ${board}`);
      const { body } = await json(
        `/skills${query({ limit: String(LIST_LIMIT), sort, nonSuspiciousOnly: "true" })}`,
      );
      const items = Array.isArray(body.items) ? body.items : [];
      return items.flatMap((raw) => {
        const entry = entryOf(raw);
        return entry ? [entry] : [];
      });
    },

    search: async (text, limit) => {
      const capped = Math.min(Math.max(Math.floor(limit) || LIST_LIMIT, 1), MAX_SEARCH_LIMIT);
      const { body } = await json(`/search${query({ q: text, limit: String(capped) })}`);
      const results = Array.isArray(body.results) ? body.results : [];
      return results
        .flatMap((raw) => {
          const entry = entryOf(raw);
          return entry ? [entry] : [];
        })
        .slice(0, capped);
    },

    detail,

    audits: async (owner, slug) => {
      try {
        const { body } = await json(`/skills/${encodeURIComponent(slug)}/scan${query({ owner })}`);
        const security = asObject(body.security);
        const moderation = asObject(body.moderation);
        const status = asText(security.status);
        if (!status && Object.keys(moderation).length === 0) return [];
        const scanners = asObject(security.scanners);
        const analysis = Object.values(scanners)
          .map((scanner) => asText(asObject(scanner).analysis))
          .find((text) => text);
        const checkedAt = asNumber(security.checkedAt);
        const audit: MarketAudit = {
          provider: `${CLAWHUB_NAME} scan`,
          status: moderation.isMalwareBlocked
            ? "fail"
            : moderation.isSuspicious
              ? "warn"
              : (SCAN_STATUSES[(status ?? "").toLowerCase()] ?? "unknown"),
          summary: analysis ? (analysis.split(/\r?\n/).find((line) => line.trim()) ?? null) : null,
          riskLevel: status ? status.toUpperCase() : null,
          auditedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
          url: clawhubSkillUrl(owner, slug),
        };
        return [audit];
      } catch (error) {
        if (error instanceof AppError && error.code === "NOT_FOUND") return [];
        return null;
      }
    },

    latestVersion: async (owner, slug) => {
      const found = await detail(owner, slug);
      if (!found.version) throw notFound(`${owner}/${slug} has no published version`);
      return found.version;
    },

    download: async (owner, slug, version, signal) => {
      const path = `/download${query({ slug, ownerHandle: owner, version })}`;
      const response = await request(
        path,
        "application/zip, application/json",
        DOWNLOAD_TIMEOUT_MS,
      );
      if (response.status === 404)
        throw notFound(`${owner}/${slug}@${version} is not on ${CLAWHUB_NAME}`);
      if (!response.ok)
        throw new AppError("NETWORK", `${CLAWHUB_NAME} answered with HTTP ${response.status}`);
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        // A skill mirrored from GitHub: the registry hands over an archive address instead.
        const handoff = asObject(await response.json());
        const archiveUrl = asText(handoff.archiveUrl);
        if (!archiveUrl) throw new AppError("NETWORK", `${CLAWHUB_NAME} sent no download`);
        const follow = await fetchImpl(archiveUrl, {
          headers: { "User-Agent": APP_SLUG },
          signal: signal ?? AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!follow.ok)
          throw new AppError("NETWORK", `The download answered with HTTP ${follow.status}`);
        return Buffer.from(await follow.arrayBuffer());
      }
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
