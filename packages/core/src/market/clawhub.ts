import {
  API_TIMEOUT_MS,
  CLAWHUB_API_URL,
  CLAWHUB_NAME,
  HTTP_CONFLICT,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
  type MarketAudit,
  type MarketBoard,
  type MarketSkill,
  SECOND_MS,
  clawhubMarketId,
  clawhubSkillUrl,
  formatTimestampIso,
} from "@loadout/shared";
import { AppError, invalid, notFound } from "../errors";
import { isZip } from "../install/archive";
import {
  type HttpAnswer,
  type HttpRequest,
  downloadWith,
  jsonOptions,
  readJson,
} from "../install/download";
import type { MarketDetailParts } from "./detail";
import { type Json, asNumber, asObject, asText } from "./json";

/**
 * The ClawHub registry (clawhub.ai): public read endpoints, no token. Skills are versioned and
 * served as zip files by ClawHub itself; a slug can exist under several publishers, so a skill
 * is always named `owner/slug`.
 */

const DOWNLOAD_TIMEOUT_MS = 60 * SECOND_MS;
const PUBLISH_TIMEOUT_MS = 120 * SECOND_MS;
const LIST_LIMIT = 50;
/** Sort each board asks the registry for. */
const BOARD_SORTS: Partial<Record<MarketBoard, string>> = {
  trending: "trending",
  downloads: "downloads",
  newest: "createdAt",
};
/** ClawHub's own files inside a download, not part of the skill. */
export const CLAWHUB_META_FILES: ReadonlySet<string> = new Set(["_meta.json"]);

/** A published skill as the registry lists it. */
export type ClawhubEntry = Omit<MarketSkill, "installed">;

export interface ClawhubDetail extends MarketDetailParts {
  owner: string;
  slug: string;
}

export interface ClawhubClient {
  list(board: MarketBoard): Promise<ClawhubEntry[]>;
  /** `limit` comes clamped by the marketplace service. */
  search(query: string, limit: number): Promise<ClawhubEntry[]>;
  /** The skill, its latest version and its SKILL.md. With `owner` unset, the registry's first match. */
  detail(owner: string | null, slug: string): Promise<ClawhubDetail>;
  /** Security scan of the version, as audits; null when the scan could not be read. */
  audits(owner: string, slug: string): Promise<MarketAudit[] | null>;
  /** The latest version's number. */
  latestVersion(owner: string, slug: string): Promise<string>;
  /** The zip of one version. */
  download(owner: string, slug: string, version: string, signal?: AbortSignal): Promise<Buffer>;
  /** The handle a token signs in as. INVALID_INPUT when the registry refuses the token. */
  whoami(token: string): Promise<string>;
  /** Every version published under a slug and handle, newest first; empty when not published. */
  versions(owner: string, slug: string): Promise<string[]>;
  /** Upload one version. Files are `path` inside the skill and their bytes. */
  publish(
    token: string,
    payload: Record<string, unknown>,
    files: readonly { path: string; data: Buffer }[],
  ): Promise<{ status: "published" | "pending" }>;
}

const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_TOO_MANY = 429;
/** Statuses the registry explains in its own answer; the rest are mapped like any download. */
const READ_STATUSES: ReadonlySet<number> = new Set([
  HTTP_UNAUTHORIZED,
  HTTP_NOT_FOUND,
  HTTP_CONFLICT,
  HTTP_TOO_MANY,
]);
const isOk = (status: number): boolean => status >= HTTP_OK_MIN && status <= HTTP_OK_MAX;

const JSON_OPEN = "{".charCodeAt(0);

/** The archive address in the registry's answer for a skill mirrored from GitHub, else null. */
function handoffUrl(data: Buffer): string | null {
  if (isZip(data)) return null;
  if (data.find((byte) => byte > 0x20) !== JSON_OPEN) return null;
  try {
    return asText(asObject(JSON.parse(data.toString("utf8"))).archiveUrl) ?? "";
  } catch {
    return "";
  }
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

/**
 * Every call goes through the shared requester: size caps, timeouts, cancelling, one retry when
 * the registry is busy, and the same error mapping as any download.
 */
export function createClawhubClient(request: HttpRequest): ClawhubClient {
  const download = downloadWith(request);

  async function call(
    path: string,
    init: { token?: string; method?: string; body?: FormData; timeoutMs?: number } = {},
  ): Promise<HttpAnswer> {
    return request(
      `${CLAWHUB_API_URL}${path}`,
      jsonOptions({
        label: CLAWHUB_NAME,
        subject: "The skill",
        method: init.method,
        body: init.body,
        headers: init.token ? { Authorization: `Bearer ${init.token}` } : undefined,
        timeoutMs: init.timeoutMs ?? API_TIMEOUT_MS,
        // A publish reads every answer itself; reads only the ones the registry explains.
        answers: init.method ? () => true : (status) => READ_STATUSES.has(status),
      }),
    );
  }

  async function json(
    path: string,
    init: { token?: string } = {},
  ): Promise<{ status: number; body: Json }> {
    const { status, body: data } = await call(path, init);
    const body = asObject(readJson(data, CLAWHUB_NAME, !isOk(status)));
    if (status === HTTP_UNAUTHORIZED) throw invalid(`${CLAWHUB_NAME} refused the token`);
    if (status === HTTP_NOT_FOUND) throw notFound(asText(body.message) ?? `Not on ${CLAWHUB_NAME}`);
    if (status === HTTP_TOO_MANY) {
      throw new AppError("NETWORK", `${CLAWHUB_NAME} is rate limiting requests; try again later`);
    }
    return { status, body };
  }

  async function detail(owner: string | null, slug: string): Promise<ClawhubDetail> {
    const { status, body } = await json(`/skills/${encodeURIComponent(slug)}${query({ owner })}`);
    if (status === HTTP_CONFLICT) {
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
      const { body } = await json(`/search${query({ q: text, limit: String(limit) })}`);
      const results = Array.isArray(body.results) ? body.results : [];
      return results
        .flatMap((raw) => {
          const entry = entryOf(raw);
          return entry ? [entry] : [];
        })
        .slice(0, limit);
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
          auditedAt: checkedAt ? formatTimestampIso(checkedAt) : null,
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

    whoami: async (token) => {
      const { body } = await json("/whoami", { token });
      const handle = asText(asObject(body.user).handle) ?? asText(body.handle);
      if (!handle) throw invalid(`${CLAWHUB_NAME} did not say who the token belongs to`);
      return handle;
    },

    versions: async (owner, slug) => {
      try {
        const { body } = await json(
          `/skills/${encodeURIComponent(slug)}/versions${query({ owner })}`,
        );
        const items = Array.isArray(body.items)
          ? body.items
          : Array.isArray(body.versions)
            ? body.versions
            : [];
        return items.flatMap((raw) => {
          const version = asText(asObject(raw).version);
          return version ? [version] : [];
        });
      } catch (error) {
        if (error instanceof AppError && error.code === "NOT_FOUND") return [];
        throw error;
      }
    },

    publish: async (token, payload, files) => {
      const form = new FormData();
      form.set("payload", JSON.stringify(payload));
      for (const file of files) {
        form.append("files", new Blob([new Uint8Array(file.data)]), file.path);
      }
      const { status, body: data } = await call("/skills", {
        token,
        method: "POST",
        body: form,
        timeoutMs: PUBLISH_TIMEOUT_MS,
      });
      if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
        throw invalid(`${CLAWHUB_NAME} refused the token, or it may not publish under that handle`);
      }
      if (status === HTTP_TOO_MANY) {
        throw new AppError(
          "NETWORK",
          `${CLAWHUB_NAME} is rate limiting publishes; try again later`,
        );
      }
      if (!isOk(status)) {
        const text = data.toString("utf8").trim();
        throw invalid(`${CLAWHUB_NAME} did not accept the version: ${text || `HTTP ${status}`}`);
      }
      const body = asObject(readJson(data, CLAWHUB_NAME, true));
      return { status: asText(body.publicationStatus) === "pending" ? "pending" : "published" };
    },

    download: async (owner, slug, version, signal) => {
      const options = {
        signal,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        subject: `The ${CLAWHUB_NAME} skill`,
        label: `${owner}/${slug}@${version}`,
      };
      const data = await download(
        `${CLAWHUB_API_URL}/download${query({ slug, ownerHandle: owner, version })}`,
        { ...options, accept: "application/zip, application/json" },
      );
      const archiveUrl = handoffUrl(data);
      if (archiveUrl === null) return data;
      // A skill mirrored from GitHub: the registry hands over an archive address instead.
      if (!archiveUrl) throw new AppError("NETWORK", `${CLAWHUB_NAME} sent no download`);
      if (!URL.canParse(archiveUrl) || new URL(archiveUrl).protocol !== "https:") {
        throw new AppError("NETWORK", `${CLAWHUB_NAME} sent a download address that is not https`);
      }
      return download(archiveUrl, { ...options, label: undefined });
    },
  };
}
