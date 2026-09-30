import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Core, createCore } from "../src/core";
import { silentLogger } from "../src/log";
import { tempDir } from "./helpers";

const OWNER = "pskoett";
const SLUG = "self-improving-agent";
const API = "https://clawhub.ai/api/v1";

function zip(files: Record<string, string>): Buffer {
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))),
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A registry with one skill, whose latest version the test can move. */
function fakeRegistry() {
  const state = { version: "1.0.0", calls: [] as string[], offline: false };
  const skillBody = (version: string): string =>
    `---\nname: ${SLUG}\ndescription: Learns from mistakes\n---\n\n# v${version}\n`;
  const item = () => ({
    ownerHandle: OWNER,
    slug: SLUG,
    displayName: "Self-improving agent",
    summary: "Captures learnings.",
    stats: { installs: 18457, downloads: 481943 },
    latestVersion: { version: state.version },
  });
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    state.calls.push(url);
    if (state.offline) throw new Error("ENOTFOUND clawhub.ai");
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace("/api/v1", "");
    if (path === "/skills")
      return json({ items: [item(), { slug: "no-owner" }], nextCursor: null });
    if (path === "/search") return json({ results: [{ ...item(), score: 1 }] });
    if (path === `/skills/${SLUG}`) {
      if (!searchParams.get("owner")) {
        return json(
          { code: "AMBIGUOUS_SKILL_SLUG", matches: [{ ownerHandle: OWNER, slug: SLUG }] },
          409,
        );
      }
      return json({
        skill: {
          slug: SLUG,
          displayName: "Self-improving agent",
          description: skillBody(state.version),
        },
        latestVersion: { version: state.version, changelog: "Fixes." },
        owner: { handle: OWNER },
      });
    }
    if (path === `/skills/${SLUG}/scan`) {
      return json({
        security: {
          status: "clean",
          checkedAt: 1789024532178,
          scanners: { vt: { analysis: "Type: skill\nLooks fine." } },
        },
      });
    }
    if (path === "/download") {
      const version = searchParams.get("version") ?? state.version;
      return new Response(
        zip({ "SKILL.md": skillBody(version), "skill-card.md": "# card\n", "_meta.json": "{}" }),
        { headers: { "content-type": "application/zip" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { state, fetchImpl };
}

describe("ClawHub as a marketplace", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  let registry: ReturnType<typeof fakeRegistry>;
  beforeEach(() => {
    temp = tempDir();
    registry = fakeRegistry();
    core = createCore({
      homeDir: temp.dir,
      configDir: join(temp.dir, "config"),
      logger: silentLogger,
      safetyScannerPath: null,
      fetchImpl: registry.fetchImpl,
    });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("lists, searches and describes skills, and works from the cache when offline", async () => {
    const board = await core.api.market.board("trending", "clawhub");
    expect(board.cachedAt).toBeNull();
    expect(board.skills).toEqual([
      expect.objectContaining({
        provider: "clawhub",
        id: `clawhub:${OWNER}/${SLUG}`,
        source: OWNER,
        skillId: SLUG,
        name: "Self-improving agent",
        installs: 18457,
        version: "1.0.0",
        installed: false,
      }),
    ]);
    expect(registry.state.calls.at(-1)).toContain(`${API}/skills?limit=50&sort=trending`);

    const search = await core.api.market.search("agent", 10, "clawhub");
    expect(search.skills.map((skill) => skill.skillId)).toEqual([SLUG]);

    const detail = await core.api.market.detail("", SLUG, "clawhub");
    expect(detail).toMatchObject({
      provider: "clawhub",
      source: OWNER,
      version: "1.0.0",
      changelog: "Fixes.",
      repoUrl: null,
      documentPath: "SKILL.md",
      pageUrl: `https://clawhub.ai/${OWNER}/skills/${SLUG}`,
    });
    expect(detail.document).toContain("# v1.0.0");
    expect(detail.audits).toEqual([
      expect.objectContaining({ provider: "ClawHub scan", status: "pass", summary: "Type: skill" }),
    ]);

    registry.state.offline = true;
    core.ctx.db.run("UPDATE market_cache SET fetched_at = ?", Date.now() - 600_000);
    const stale = await core.api.market.board("trending", "clawhub");
    expect(stale.cachedAt).not.toBeNull();
    expect(stale.skills).toHaveLength(1);
  });

  it("installs a version, sees the next one, and updates to it", async () => {
    const skill = await core.api.install.fromClawhub(OWNER, SLUG);
    expect(skill).toMatchObject({
      name: SLUG,
      sourceType: "clawhub",
      sourceRef: `${OWNER}/${SLUG}`,
      sourceRevision: "1.0.0",
      updateStatus: "up_to_date",
    });
    expect(readFileSync(join(skill.libraryPath, "SKILL.md"), "utf8")).toContain("# v1.0.0");
    expect(existsSync(join(skill.libraryPath, "_meta.json"))).toBe(false);
    expect(existsSync(join(skill.libraryPath, "skill-card.md"))).toBe(true);
    const listed = await core.api.market.search("agent", 10, "clawhub");
    expect(listed.skills[0]?.installed).toBe(true);

    // Installing again refreshes in place rather than adding a second copy.
    const again = await core.api.install.fromClawhub(OWNER, SLUG);
    expect(again.id).toBe(skill.id);

    registry.state.version = "1.1.0";
    const checked = await core.api.updates.check(skill.id, true);
    expect(checked).toMatchObject({ updateStatus: "update_available", remoteRevision: "1.1.0" });
    const preview = await core.api.updates.sourceDocument(skill.id);
    expect(preview.content).toContain("# v1.1.0");
    expect(preview.sourceLabel).toBe("ClawHub");

    const result = await core.api.updates.update(skill.id);
    expect(result.contentChanged).toBe(true);
    expect(result.pendingRemovals).toEqual([]);
    const updated = await core.api.skills.get(skill.id);
    expect(updated.sourceRevision).toBe("1.1.0");
    expect(readFileSync(join(updated.libraryPath, "SKILL.md"), "utf8")).toContain("# v1.1.0");
  });

  it("refuses an odd reference", async () => {
    await expect(core.api.install.fromClawhub("a/b", "c")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});
