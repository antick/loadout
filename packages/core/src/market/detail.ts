import {
  MARKETPLACE_URL,
  type MarketAudit,
  type MarketAuditStatus,
  type MarketSkillDetail,
} from "@loadout/shared";
import { invalid, isAppError } from "../errors";
import type { Download } from "../install/download";

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
const SKILL_FILE = "skill.md";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 1024 * 1024;
const SOURCE_SHAPE = /^[\w.-]+\/[\w.-]+$/;
const SKILL_ID_SHAPE = /^[\w.:-]+$/;
const STATUSES: ReadonlySet<string> = new Set(["pass", "warn", "fail"]);
/** Files read to settle which of several overlapping folders holds the skill. */
const MAX_MAYBE_READS = 4;
/** Where skills usually sit, tried when the repository listing is out of reach. */
const GUESSED_FOLDERS = ["skills/", "", ".claude/skills/", ".agents/skills/"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Audits from the marketplace's answer; entries without a provider are left out. */
export function parseAudits(body: unknown, pageUrl: string): MarketAudit[] {
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
  /** Certain on sight: the folder is named after the skill, or it is the only `SKILL.md`. */
  sure: string | null;
  /** Folders whose name overlaps the skill id (`react-best-practices` for `vercel-react-…`): kept
   * only when the file's own `name` is the skill id. */
  maybe: string[];
}

const MIN_OVERLAP = 3;

function byLength(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}

/** Candidate `SKILL.md` paths for `skillId` among a repository's files. */
export function documentCandidates(paths: readonly string[], skillId: string): DocumentCandidates {
  const documents = paths.filter((path) => path.split("/").at(-1)?.toLowerCase() === SKILL_FILE);
  const id = skillId.toLowerCase();
  const folder = (path: string): string => path.split("/").at(-2)?.toLowerCase() ?? "";
  const named = documents.filter((path) => folder(path) === id).sort(byLength);
  if (named[0]) return { sure: named[0], maybe: [] };
  if (documents.length === 1) return { sure: documents[0] ?? null, maybe: [] };
  const overlapping = documents.filter((path) => {
    const name = folder(path);
    return name.length >= MIN_OVERLAP && (id.includes(name) || name.includes(id));
  });
  return { sure: null, maybe: overlapping.sort(byLength) };
}

/** The `name` in a document's frontmatter, or null. */
export function frontmatterName(content: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? "";
  const name = /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(block)?.[1];
  return name?.trim() || null;
}

export interface MarketDetailDeps {
  download: Download;
}

export function createMarketDetail(
  deps: MarketDetailDeps,
): (source: string, skillId: string) => Promise<MarketSkillDetail> {
  const { download } = deps;

  async function json(url: string): Promise<unknown> {
    const data = await download(url, {
      accept: "application/json",
      maxBytes: MAX_JSON_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return JSON.parse(data.toString("utf8"));
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

  async function listed(source: string, skillId: string): Promise<DocumentCandidates | null> {
    try {
      const body = await json(`${GITHUB_API}/${source}/git/trees/${TREE_REF}?recursive=1`);
      const tree = isRecord(body) && Array.isArray(body.tree) ? body.tree : [];
      const paths = tree.flatMap((entry) =>
        isRecord(entry) && entry.type === "blob" && typeof entry.path === "string"
          ? [entry.path]
          : [],
      );
      return documentCandidates(paths, skillId);
    } catch {
      // Rate limited or offline: fall back to the usual places.
      return null;
    }
  }

  /** The first of `paths` that downloads, and (when `nameMustBe` is set) carries that name. */
  async function firstReadable(
    source: string,
    paths: readonly string[],
    nameMustBe: string | null,
  ): Promise<{ path: string; content: string } | null> {
    for (const path of paths) {
      try {
        const content = await raw(source, path);
        const name = frontmatterName(content)?.toLowerCase();
        if (nameMustBe === null || name === nameMustBe.toLowerCase()) return { path, content };
      } catch {
        // Try the next place.
      }
    }
    return null;
  }

  async function document(
    source: string,
    skillId: string,
  ): Promise<{ path: string; content: string } | null> {
    const candidates = await listed(source, skillId);
    if (!candidates) {
      const guesses = GUESSED_FOLDERS.map((folder) => `${folder}${skillId}/SKILL.md`);
      return firstReadable(source, guesses, null);
    }
    if (candidates.sure) return firstReadable(source, [candidates.sure], null);
    return firstReadable(source, candidates.maybe.slice(0, MAX_MAYBE_READS), skillId);
  }

  return async (source, skillId) => {
    const repo = source.trim();
    const id = skillId.trim();
    if (!SOURCE_SHAPE.test(repo)) throw invalid(`Invalid marketplace source: '${source}'`);
    if (!SKILL_ID_SHAPE.test(id)) throw invalid(`Invalid marketplace skill id: '${skillId}'`);
    const pageUrl = `${MARKETPLACE_URL}/${repo}/${encodeURIComponent(id)}`;
    const [found, published] = await Promise.all([
      document(repo, id),
      audits(repo, encodeURIComponent(id), pageUrl),
    ]);
    return {
      id: `${repo}/${id}`,
      source: repo,
      skillId: id,
      pageUrl,
      repoUrl: `${GITHUB_WEB}/${repo}`,
      audits: published,
      document: found?.content ?? null,
      documentPath: found?.path ?? null,
    };
  };
}
