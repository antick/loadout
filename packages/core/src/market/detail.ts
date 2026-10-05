import {
  MARKETPLACE_URL,
  type MarketAudit,
  type MarketAuditStatus,
  type MarketSkillDetail,
  SKILL_MARKER_FILES,
  lastPathSegment,
  splitFrontmatter,
  textField,
  isRecord,
} from "@loadout/shared";
import { invalid, isAppError, isUnanswered } from "../errors";
import { type Download, jsonOptions, readJson } from "../install/download";
import { locateSkill, usualSkillPaths } from "../install/repo-scan";

/**
 * What to read before installing a marketplace skill: the security audits the marketplace
 * publishes (a public JSON endpoint) and the skill's `SKILL.md`, found in its GitHub repository.
 * Either part may be missing; the other is still shown.
 */

const AUDIT_PATH = "/api/v1/skills/audit";
const GITHUB_API = "https://api.github.com/repos";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const GITHUB_WEB = "https://github.com";
const TREE_REF = "HEAD";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DOCUMENT_BYTES = 1024 * 1024;
const SOURCE_SHAPE = /^[\w.-]+\/[\w.-]+$/;
const SKILL_ID_SHAPE = /^[\w.:-]+$/;
const STATUSES: ReadonlySet<string> = new Set(["pass", "warn", "fail"]);
/** Files read to settle which of several overlapping folders holds the skill. */
const MAX_MAYBE_READS = 4;
const [MAIN_MARKER] = SKILL_MARKER_FILES;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Audits from the marketplace's answer; entries without a provider are left out. */
function parseAudits(body: unknown, pageUrl: string): MarketAudit[] {
  const list = isRecord(body) && Array.isArray(body.audits) ? body.audits : [];
  return list.flatMap((entry): MarketAudit[] => {
    if (!isRecord(entry)) return [];
    const provider = text(entry.provider);
    if (!provider) return [];
    const status = (text(entry.status) ?? "").toLowerCase();
    const slug = text(entry.slug);
    return [
      {
        provider,
        status: (STATUSES.has(status) ? status : "unknown") as MarketAuditStatus,
        summary: text(entry.summary),
        riskLevel: text(entry.riskLevel),
        auditedAt: text(entry.auditedAt),
        url: slug ? `${pageUrl}/security/${encodeURIComponent(slug)}` : pageUrl,
      },
    ];
  });
}

/** Where to look for the `SKILL.md` of `skillId`, best first; see {@link documentCandidates}. */
export interface DocumentCandidates {
  /** Certain on sight: install takes this folder by its path. */
  sure: string | null;
  /** Folders whose name overlaps the skill id (`react-best-practices` for `vercel-react-…`): kept
   * only when the file's own `name` is the skill id, as install checks it. */
  maybe: string[];
}

const MIN_OVERLAP = 3;

function byLength(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}

/**
 * Candidate `SKILL.md` paths for `skillId` among a repository's files, by the rule install finds
 * the skill with ({@link locateSkill}), so the document shown is the one install would take.
 */
function documentCandidates(paths: readonly string[], skillId: string): DocumentCandidates {
  // Each skill folder's document; `SKILL.md` over `skill.md`, as the skill reads it.
  const documents = new Map<string, string>();
  for (const path of paths) {
    const file = lastPathSegment(path);
    if (!(SKILL_MARKER_FILES as readonly string[]).includes(file)) continue;
    const dir = path.slice(0, -file.length).replace(/\/$/, "");
    if (!documents.has(dir) || file === MAIN_MARKER) documents.set(dir, path);
  }
  const { found, byName } = locateSkill([...documents.keys()], skillId);
  if (found !== null) return { sure: documents.get(found) ?? null, maybe: [] };
  // Reading every document costs a request each: only folders whose name overlaps the id.
  const id = skillId.toLowerCase();
  const overlapping = byName.filter((dir) => {
    const name = lastPathSegment(dir).toLowerCase();
    return name.length >= MIN_OVERLAP && (id.includes(name) || name.includes(id));
  });
  return {
    sure: null,
    maybe: overlapping.flatMap((dir) => documents.get(dir) ?? []).sort(byLength),
  };
}

/** The `name` in a document's frontmatter, or null. */
function frontmatterName(content: string): string | null {
  return textField(splitFrontmatter(content).data, "name");
}

export interface MarketDetailDeps {
  download: Download;
}

/** A detail as a provider answers it; the client adds whether it came from the cache. */
export type MarketDetailParts = Omit<MarketSkillDetail, "cachedAt">;

/** A fetched detail, and whether some part of it went unanswered (offline, server trouble). */
export interface FetchedDetail {
  detail: MarketDetailParts;
  unanswered: boolean;
}

/** Whether any request of one document lookup went unanswered, so "no document" is not known. */
interface LookupTrace {
  unanswered: boolean;
}

/** Note a failed request on the trace. */
function noteFailure(trace: LookupTrace, error: unknown): void {
  if (isUnanswered(error)) trace.unanswered = true;
}

export function createMarketDetail(
  deps: MarketDetailDeps,
): (source: string, skillId: string) => Promise<FetchedDetail> {
  const { download } = deps;

  async function json(url: string): Promise<unknown> {
    return readJson(await download(url, jsonOptions({ timeoutMs: REQUEST_TIMEOUT_MS })), url);
  }

  async function audits(source: string, skillId: string, pageUrl: string) {
    try {
      return parseAudits(
        await json(`${MARKETPLACE_URL}${AUDIT_PATH}/${source}/${skillId}`),
        pageUrl,
      );
    } catch (error) {
      // No audit record yet is an answer; anything else means we do not know.
      return isAppError(error, "NOT_FOUND") ? [] : null;
    }
  }

  async function raw(source: string, path: string): Promise<string> {
    const data = await download(`${GITHUB_RAW}/${source}/${TREE_REF}/${encodePath(path)}`, {
      maxBytes: MAX_DOCUMENT_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return data.toString("utf8");
  }

  async function listed(
    source: string,
    skillId: string,
    trace: LookupTrace,
  ): Promise<DocumentCandidates | null> {
    try {
      const body = await json(`${GITHUB_API}/${source}/git/trees/${TREE_REF}?recursive=1`);
      const tree = isRecord(body) && Array.isArray(body.tree) ? body.tree : [];
      const paths = tree.flatMap((entry) =>
        isRecord(entry) && entry.type === "blob" && typeof entry.path === "string"
          ? [entry.path]
          : [],
      );
      return documentCandidates(paths, skillId);
    } catch (error) {
      // Rate limited or offline: fall back to the usual places.
      noteFailure(trace, error);
      return null;
    }
  }

  /** The first of `paths` that downloads, and (when `nameMustBe` is set) carries that name. */
  async function firstReadable(
    source: string,
    paths: readonly string[],
    nameMustBe: string | null,
    trace: LookupTrace,
  ): Promise<{ path: string; content: string } | null> {
    for (const path of paths) {
      try {
        const content = await raw(source, path);
        if (nameMustBe === null || frontmatterName(content) === nameMustBe)
          return { path, content };
      } catch (error) {
        // Try the next place.
        noteFailure(trace, error);
      }
    }
    return null;
  }

  async function document(
    source: string,
    skillId: string,
    trace: LookupTrace,
  ): Promise<{ path: string; content: string } | null> {
    const candidates = await listed(source, skillId, trace);
    if (!candidates) {
      const guesses = usualSkillPaths(skillId).map((dir) => `${dir}/${MAIN_MARKER}`);
      return firstReadable(source, guesses, null, trace);
    }
    if (candidates.sure) return firstReadable(source, [candidates.sure], null, trace);
    return firstReadable(source, candidates.maybe.slice(0, MAX_MAYBE_READS), skillId, trace);
  }

  return async (source, skillId) => {
    const repo = source.trim();
    const id = skillId.trim();
    if (!SOURCE_SHAPE.test(repo)) throw invalid(`Invalid marketplace source: '${source}'`);
    if (!SKILL_ID_SHAPE.test(id)) throw invalid(`Invalid marketplace skill id: '${skillId}'`);
    const pageUrl = `${MARKETPLACE_URL}/${repo}/${encodeURIComponent(id)}`;
    const trace: LookupTrace = { unanswered: false };
    const [found, published] = await Promise.all([
      document(repo, id, trace),
      audits(repo, encodeURIComponent(id), pageUrl),
    ]);
    return {
      detail: {
        provider: "skills_sh",
        id: `${repo}/${id}`,
        source: repo,
        skillId: id,
        pageUrl,
        repoUrl: `${GITHUB_WEB}/${repo}`,
        version: null,
        changelog: null,
        audits: published,
        document: found?.content ?? null,
        documentPath: found?.path ?? null,
      },
      // A document found anyway is known, whatever else went unanswered on the way.
      unanswered: published === null || (found === null && trace.unanswered),
    };
  };
}
