/** A marketplace listing entry before it is matched against the library. */
export interface MarketEntry {
  /** `owner/repo`. */
  source: string;
  skillId: string;
  name: string;
  installs: number;
}

const NEXT_DATA_SCRIPT = /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
/** Keys under `props.pageProps` that have carried the skill list, in the order we trust them. */
const PAGE_PROPS_LISTS = ["initialSkills", "skills", "items"] as const;
/** An object with no nested object inside it; listing entries are flat. */
const FLAT_OBJECT = /\{[^{}]*\}/g;
const SOURCE_SHAPE = /^[\w.-]+\/[\w.-]+$/;
const ESCAPED_QUOTE = '\\"';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value.replaceAll(",", "")) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : 0;
}

/** One entry from any of the shapes the site has used, or null when it is not a skill. */
export function toMarketEntry(value: unknown): MarketEntry | null {
  if (!isRecord(value)) return null;
  const source = text(value.source);
  if (!source || !SOURCE_SHAPE.test(source)) return null;
  let skillId = text(value.skillId) ?? text(value.skill_id) ?? text(value.id);
  // Some responses carry the full `owner/repo/skill` id instead of the bare skill id.
  if (skillId?.startsWith(`${source}/`)) skillId = skillId.slice(source.length + 1);
  if (!skillId || skillId.includes("/")) return null;
  return { source, skillId, name: text(value.name) ?? skillId, installs: count(value.installs) };
}

/** Keep the first entry per `source/skillId`, preserving the site's ranking order. */
export function dedupeEntries(entries: MarketEntry[]): MarketEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const id = `${entry.source}/${entry.skillId}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function fromList(list: unknown): MarketEntry[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => toMarketEntry(item) ?? []);
}

function fromNextData(html: string): MarketEntry[] {
  const json = NEXT_DATA_SCRIPT.exec(html)?.[1];
  if (!json) return [];
  try {
    const data: unknown = JSON.parse(json);
    const props = isRecord(data) && isRecord(data.props) ? data.props.pageProps : null;
    if (!isRecord(props)) return [];
    for (const key of PAGE_PROPS_LISTS) {
      const entries = fromList(props[key]);
      if (entries.length > 0) return entries;
    }
  } catch {
    // Not the JSON we expected; the embedded-object scan below still gets a chance.
  }
  return [];
}

/** Strip every level of `\"` escaping: streamed script payloads nest JSON inside JS strings. */
function unescapeQuotes(input: string): string {
  let out = input;
  while (out.includes(ESCAPED_QUOTE)) out = out.replaceAll(ESCAPED_QUOTE, '"');
  return out;
}

function fieldsOf(literal: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const match of literal.matchAll(/"(\w+)"\s*:\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?))/g)) {
    const [, key, quoted, numeric] = match;
    if (key) fields[key] = quoted ?? numeric ?? "";
  }
  return fields;
}

function fromEmbeddedObjects(html: string): MarketEntry[] {
  const entries: MarketEntry[] = [];
  for (const [literal] of unescapeQuotes(html).matchAll(FLAT_OBJECT)) {
    if (!literal.includes('"source"')) continue;
    let value: unknown;
    try {
      value = JSON.parse(literal);
    } catch {
      // Unescaping can leave a literal that is no longer strict JSON; read its fields loosely.
      value = fieldsOf(literal);
    }
    const entry = toMarketEntry(value);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * Skills listed on a server-rendered board page. Tries the page-data script first, then any skill
 * objects embedded in the markup, plain or escaped inside a streamed script payload.
 */
export function parseBoardHtml(html: string): MarketEntry[] {
  const fromScript = fromNextData(html);
  return dedupeEntries(fromScript.length > 0 ? fromScript : fromEmbeddedObjects(html));
}

/** The search endpoint answers with a bare array or with `{ skills: [...] }`. */
export function parseSearchResponse(body: unknown): MarketEntry[] {
  return dedupeEntries(fromList(isRecord(body) ? body.skills : body));
}
