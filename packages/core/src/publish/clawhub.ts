import { readFileSync } from "node:fs";
import {
  CLAWHUB_LICENSE,
  CLAWHUB_MAX_FILE_BYTES,
  CLAWHUB_MAX_TOPICS,
  CLAWHUB_MAX_TOPIC_LENGTH,
  CLAWHUB_MAX_TOTAL_BYTES,
  CLAWHUB_NAME,
  CLAWHUB_SLUG_PATTERN,
  CLAWHUB_VERSION_PATTERN,
  type ClawhubAccount,
  type ClawhubPublishInput,
  type ClawhubPublishPreview,
  type ClawhubPublishResult,
  type SecretFinding,
  clawhubSkillUrl,
  clawhubSlugOf,
  isNewerVersion,
  nextPatchVersion,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, errorMessage, invalid } from "../errors";
import type { ClawhubClient } from "../market/clawhub";
import type { SkillStore } from "../skills/store";
import { listContentFiles } from "../util/hash";
import { SECRET_PATTERNS } from "../util/secret-patterns";

/**
 * Publishing one library skill as a version on ClawHub, under the user's own token. The token
 * lives in the system keychain and is sent only to ClawHub, as a bearer header.
 */

const TOKEN_KEY = "clawhub.token";
const NO_KEYCHAIN = "The system keychain is not available, so a ClawHub token cannot be kept.";
const NO_TOKEN = `No ${CLAWHUB_NAME} token is saved. Add one in Settings → Marketplaces.`;
/** Registry topics are lower case, short, and ClawHub keeps a few words for itself. */
const RESERVED_TOPICS: ReadonlySet<string> = new Set(["clawhub", "official", "verified"]);
/** Entries never sent: dependencies, environments, version control, editor and OS litter. */
const LEFT_OUT_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  ".env",
  ".DS_Store",
  ".clawhub",
  "_meta.json",
]);
const MAX_SCANNED_BYTES = 1024 * 1024;

export interface ClawhubPublisherDeps {
  store: SkillStore;
  clawhub: ClawhubClient;
}

export interface ClawhubPublisher {
  account(): Promise<ClawhubAccount>;
  setToken(token: string | null): Promise<ClawhubAccount>;
  preview(skillId: string): Promise<ClawhubPublishPreview>;
  publish(input: ClawhubPublishInput): Promise<ClawhubPublishResult>;
}

function leftOut(relativePath: string): boolean {
  return relativePath.split("/").some((part) => LEFT_OUT_NAMES.has(part));
}

/** Topics as ClawHub takes them: from tags, lower case, capped in number and length. */
export function clawhubTopicsOf(tags: readonly string[]): string[] {
  const topics = tags
    .map((tag) => clawhubSlugOf(tag))
    .filter((tag) => tag && tag.length <= CLAWHUB_MAX_TOPIC_LENGTH && !RESERVED_TOPICS.has(tag));
  return [...new Set(topics)].slice(0, CLAWHUB_MAX_TOPICS);
}

/** The first and last few characters of a key, the rest hidden. */
function mask(value: string): string {
  return value.length <= 8 ? "…" : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function secretFindings(
  files: readonly { path: string; absolutePath: string; data: Buffer }[],
): SecretFinding[] {
  const found: SecretFinding[] = [];
  for (const file of files) {
    if (file.data.length > MAX_SCANNED_BYTES || file.data.includes(0)) continue;
    const text = file.data.toString("utf8");
    for (const secret of SECRET_PATTERNS) {
      secret.regex.lastIndex = 0;
      const match = secret.regex.exec(text);
      if (!match) continue;
      const line = text.slice(0, match.index).split("\n").length;
      found.push({
        id: `${file.path}:${line}:${secret.kind}`,
        file: file.path,
        path: file.absolutePath,
        line,
        kind: secret.kind,
        masked: mask(match[0]),
        committed: false,
      });
    }
  }
  return found;
}

export function createClawhubPublisher(
  ctx: CoreContext,
  deps: ClawhubPublisherDeps,
): ClawhubPublisher {
  const { store, clawhub } = deps;
  /** The handle the saved token was last confirmed as, so the form does not ask again. */
  let confirmed: { token: string; handle: string } | null = null;

  async function savedToken(): Promise<string | null> {
    return ctx.secrets.available() ? await ctx.secrets.get(TOKEN_KEY) : null;
  }

  async function handleOf(token: string): Promise<string> {
    if (confirmed?.token === token) return confirmed.handle;
    const handle = await clawhub.whoami(token);
    confirmed = { token, handle };
    return handle;
  }

  async function requireToken(): Promise<{ token: string; handle: string }> {
    const token = await savedToken();
    if (!token) throw new AppError("UNSUPPORTED", NO_TOKEN);
    return { token, handle: await handleOf(token) };
  }

  async function account(): Promise<ClawhubAccount> {
    const available = ctx.secrets.available();
    const token = await savedToken();
    if (!token) return { available, saved: false, handle: null, problem: null };
    try {
      return { available, saved: true, handle: await handleOf(token), problem: null };
    } catch (error) {
      return { available, saved: true, handle: null, problem: errorMessage(error) };
    }
  }

  function filesOf(skillId: string): { path: string; absolutePath: string; data: Buffer }[] {
    const skill = store.get(skillId);
    return listContentFiles(skill.libraryPath)
      .filter((file) => !leftOut(file.relativePath))
      .map((file) => ({
        path: file.relativePath,
        absolutePath: file.absolutePath,
        data: readFileSync(file.absolutePath),
      }));
  }

  async function preview(skillId: string): Promise<ClawhubPublishPreview> {
    const skill = store.get(skillId);
    const { handle } = await requireToken();
    const slug = clawhubSlugOf(skill.name);
    const files = filesOf(skillId);
    const totalBytes = files.reduce((sum, file) => sum + file.data.length, 0);
    const problems: string[] = [];
    if (!files.some((file) => file.path === "SKILL.md")) {
      problems.push("The skill has no SKILL.md at its top, which ClawHub requires.");
    }
    for (const file of files) {
      if (file.data.length > CLAWHUB_MAX_FILE_BYTES) {
        problems.push(`${file.path} is over ClawHub's limit of 10 MB per file.`);
      }
    }
    if (totalBytes > CLAWHUB_MAX_TOTAL_BYTES)
      problems.push("The skill is over ClawHub's limit of 50 MB.");
    if (!CLAWHUB_SLUG_PATTERN.test(slug)) problems.push("The name gives no usable slug.");
    const versions = await clawhub.versions(handle, slug);
    const latestVersion = versions.reduce<string | null>(
      (best, version) => (best === null || isNewerVersion(version, best) ? version : best),
      null,
    );
    return {
      skillId,
      handle,
      slug,
      displayName: skill.name,
      summary: skill.description,
      topics: clawhubTopicsOf(skill.tags),
      latestVersion,
      suggestedVersion: nextPatchVersion(latestVersion),
      files: files.map((file) => ({ path: file.path, bytes: file.data.length })),
      totalBytes,
      secrets: secretFindings(files),
      problems,
    };
  }

  async function publish(input: ClawhubPublishInput): Promise<ClawhubPublishResult> {
    if (!input.acceptLicense) {
      throw invalid(
        `Publishing on ${CLAWHUB_NAME} releases the version under ${CLAWHUB_LICENSE}; agree to that first.`,
      );
    }
    const slug = input.slug.trim();
    if (!CLAWHUB_SLUG_PATTERN.test(slug))
      throw invalid("The slug must be lower-case letters, digits and dashes.");
    const version = input.version.trim();
    if (!CLAWHUB_VERSION_PATTERN.test(version)) throw invalid("The version must look like 1.2.3.");
    const displayName = input.displayName.trim();
    if (!displayName) throw invalid("Give the skill a display name.");
    const skill = store.get(input.skillId);
    const { token, handle } = await requireToken();
    const files = filesOf(input.skillId);
    if (!files.some((file) => file.path === "SKILL.md"))
      throw invalid("The skill has no SKILL.md at its top.");
    const secrets = secretFindings(files);
    if (secrets.length > 0 && !input.allowSecrets) {
      throw new AppError(
        "INVALID_INPUT",
        `${secrets.length} file(s) look like they hold a key or token.`,
        {
          secrets,
        },
      );
    }
    const topics = clawhubTopicsOf(input.topics ?? skill.tags);
    const payload: Record<string, unknown> = {
      slug,
      displayName,
      version,
      changelog: input.changelog.trim(),
      summary: skill.description ?? undefined,
      acceptLicenseTerms: true,
      tags: ["latest"],
      ...(topics.length > 0 ? { topics } : {}),
    };
    const { status } = await clawhub.publish(token, payload, files);
    ctx.activity.record("publish", skill.name, `${CLAWHUB_NAME} ${handle}/${slug}@${version}`);
    return {
      handle,
      slug,
      version,
      status,
      pageUrl: clawhubSkillUrl(handle, slug),
      installCommand: `loadout skills install @${handle}/${slug}`,
    };
  }

  return {
    account,
    setToken: async (token) => {
      if (!ctx.secrets.available()) throw new AppError("UNSUPPORTED", NO_KEYCHAIN);
      const clean = token?.trim() ?? "";
      if (!clean) {
        await ctx.secrets.delete(TOKEN_KEY);
        confirmed = null;
        return account();
      }
      const handle = await clawhub.whoami(clean);
      await ctx.secrets.set(TOKEN_KEY, clean);
      confirmed = { token: clean, handle };
      return account();
    },
    preview,
    publish,
  };
}
