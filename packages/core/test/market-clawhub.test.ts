import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { createClawhubClient } from "../src/market/clawhub";
import { tempDir, createTestCore } from "./helpers";

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

const skillBody = (version: string): string =>
  `---\nname: ${SLUG}\ndescription: Learns from mistakes\n---\n\n# v${version}\n`;

/** A registry with one skill, whose latest version the test can move. */
function fakeRegistry() {
  const state = { version: "1.0.0", calls: [] as string[], offline: false };
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
    core = createTestCore({
      homeDir: temp.dir,
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

    // The detail is kept longer; past that it still shows offline, with its age.
    const fetchedAt = Date.now() - 3_600_000;
    core.ctx.db.run("UPDATE market_cache SET fetched_at = ?", fetchedAt);
    const staleDetail = await core.api.market.detail("", SLUG, "clawhub");
    expect(staleDetail).toMatchObject({ version: "1.0.0", cachedAt: fetchedAt });
    expect(staleDetail.document).toContain("# v1.0.0");
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

  it("installing again keeps the edited version and refreshes deployed copies", async () => {
    mkdirSync(join(temp.dir, ".claude"), { recursive: true });
    core.ctx.settings.set("deployMode", "copy");
    const skill = await core.api.install.fromClawhub(OWNER, SLUG);
    await core.api.deploy.apply([skill.id], ["claude_code"], "add");
    const copy = join(temp.dir, ".claude", "skills", SLUG, "SKILL.md");
    writeFileSync(join(skill.libraryPath, "notes.md"), "my own notes");

    registry.state.version = "1.1.0";
    const again = await core.api.install.fromClawhub(OWNER, SLUG);

    expect(again.id).toBe(skill.id);
    expect(readFileSync(join(again.libraryPath, "SKILL.md"), "utf8")).toContain("# v1.1.0");
    expect(readFileSync(copy, "utf8")).toContain("# v1.1.0");
    const kept = await core.api.storage.removed();
    expect(kept.map((entry) => [entry.name, entry.reason])).toEqual([[SLUG, "replaced"]]);
  });

  it("refuses an odd reference", async () => {
    await expect(core.api.install.fromClawhub("a/b", "c")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

/** A ClawHub client whose every request gets `answer`, and the addresses it asked for. */
function clientFor(answer: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    return answer(String(input), init);
  }) as typeof fetch;
  return { client: createClawhubClient({ fetchImpl }), calls };
}

describe("ClawHub downloads", () => {
  const archive = zip({ "SKILL.md": "---\nname: a\ndescription: b\n---\n" });

  it("follows the registry's handoff to an https archive", async () => {
    const { client, calls } = clientFor(async (url) =>
      url.startsWith(API)
        ? json({ archiveUrl: "https://codeload.github.com/a/b/zip/main" })
        : new Response(archive),
    );
    expect(await client.download(OWNER, SLUG, "1.0.0")).toEqual(archive);
    expect(calls.at(-1)).toBe("https://codeload.github.com/a/b/zip/main");
  });

  it("refuses a handoff to an address that is not https", async () => {
    for (const archiveUrl of ["http://example.com/a.zip", "file:///etc/passwd", "not a url"]) {
      const { client, calls } = clientFor(async () => json({ archiveUrl }));
      await expect(client.download(OWNER, SLUG, "1.0.0")).rejects.toMatchObject({
        code: "NETWORK",
      });
      expect(calls).toHaveLength(1);
    }
  });

  it("stops when cancelled, even while the zip is arriving", async () => {
    const controller = new AbortController();
    const { client } = clientFor(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(archive.subarray(0, 4));
              init?.signal?.addEventListener("abort", () => stream.error(init.signal?.reason));
              controller.abort();
            },
          }),
        ),
    );
    await expect(client.download(OWNER, SLUG, "1.0.0", controller.signal)).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });

  it("refuses a zip larger than the download cap", async () => {
    const { client } = clientFor(
      async () => new Response(archive, { headers: { "content-length": String(1024 ** 4) } }),
    );
    await expect(client.download(OWNER, SLUG, "1.0.0")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("ClawHub requests", () => {
  it("reads the registry's own explanations, and never sends a publish twice", async () => {
    const { client, calls } = clientFor(async (url) =>
      url.includes("/whoami")
        ? json({ message: "bad token" }, 401)
        : new Response("busy", { status: 503 }),
    );
    await expect(client.whoami("t")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(client.publish("t", { slug: SLUG }, [])).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringContaining("busy"),
    });
    expect(calls.filter((url) => url.endsWith("/skills"))).toHaveLength(1);
  });
});
