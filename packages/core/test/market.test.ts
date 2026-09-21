import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_SLUG, MARKETPLACE_URL } from "@loadout/shared";
import { createMarketService } from "../src/market";
import { parseBoardHtml, parseSearchResponse } from "../src/market/parse";
import { type TestWorld, createTestWorld } from "./helpers";

const PDF = { source: "acme/skills", skillId: "pdf", name: "PDF Tools", installs: 1200 };
const DOCX = { source: "acme/skills", skillId: "docx", name: "docx", installs: 35 };

const NEXT_DATA_PAGE = `<html><body><div id="__next"></div>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { initialSkills: [PDF, { ...DOCX, name: undefined }, PDF] } },
})}</script></body></html>`;

const STREAMED_PAGE = `<html><body><script>self.__next_f.push([1,"a:[\\"$\\",\\"div\\",null,{\\"skills\\":[{\\"source\\":\\"acme/skills\\",\\"skillId\\":\\"pdf\\",\\"name\\":\\"PDF Tools\\",\\"installs\\":1200},{\\"source\\":\\"acme/skills\\",\\"skill_id\\":\\"docx\\",\\"name\\":\\"docx\\",\\"installs\\":35}]}]"])</script>
<script>self.__next_f.push([1,"{\\"source\\":\\"acme/skills\\",\\"skillId\\":\\"pdf\\",\\"name\\":\\"PDF Tools\\",\\"installs\\":1200}"])</script></body></html>`;

const PLAIN_PAGE = `<html><body><main data-page='{"theme":"dark"}'>
<script type="application/json">{"items":[{"source":"acme/skills","skillId":"pdf","name":"PDF Tools","installs":"1,200"},
{"source":"acme/skills","skillId":"docx","installs":35,"name":"docx"},
{"source":"not a source","skillId":"bad","name":"bad","installs":1},
{"skillId":"no-source","name":"x","installs":1}]}</script></main></body></html>`;

interface FakeCall {
  url: string;
  headers: Record<string, string>;
}

function fakeFetch(respond: (url: string) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
    return respond(url);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const html = (body: string): Response => new Response(body, { status: 200 });
const json = (body: unknown): Response => Response.json(body);

describe("marketplace page parsing", () => {
  it("reads the page-data script", () => {
    expect(parseBoardHtml(NEXT_DATA_PAGE)).toEqual([PDF, DOCX]);
  });

  it("reads skill objects escaped inside a streamed script payload", () => {
    expect(parseBoardHtml(STREAMED_PAGE)).toEqual([PDF, DOCX]);
  });

  it("reads plain embedded objects and drops anything that is not a skill", () => {
    expect(parseBoardHtml(PLAIN_PAGE)).toEqual([PDF, DOCX]);
  });

  it("returns nothing for a page without skills, and survives broken page data", () => {
    expect(parseBoardHtml("<html><body>maintenance</body></html>")).toEqual([]);
    const broken = `<script id="__NEXT_DATA__" type="application/json">{oops</script>
      <p>{"source":"acme/skills","skillId":"pdf","name":"PDF Tools","installs":1200}</p>`;
    expect(parseBoardHtml(broken)).toEqual([PDF]);
  });

  it("reads both search answer shapes", () => {
    const rows = [
      { source: "acme/skills", id: "acme/skills/pdf", name: "PDF Tools", installs: 1200 },
      { source: "acme/skills", skill_id: "docx", installs: 35 },
      { source: "acme/skills", skillId: "docx", name: "duplicate", installs: 1 },
    ];
    expect(parseSearchResponse(rows)).toEqual([PDF, DOCX]);
    expect(parseSearchResponse({ skills: rows })).toEqual([PDF, DOCX]);
    expect(parseSearchResponse({ unexpected: true })).toEqual([]);
    expect(parseSearchResponse(null)).toEqual([]);
  });
});

describe("marketplace service", () => {
  let world: TestWorld;
  beforeEach(() => {
    world = createTestWorld();
  });
  afterEach(() => world.cleanup());

  it("fetches the right page per board, identifies itself and caches the listing", async () => {
    const { fetchImpl, calls } = fakeFetch(() => html(NEXT_DATA_PAGE));
    const market = createMarketService(world.ctx, { store: world.store, fetchImpl });

    const hot = await market.api.board("hot");
    expect(hot).toEqual([
      { id: "acme/skills/pdf", ...PDF, installed: false },
      { id: "acme/skills/docx", ...DOCX, installed: false },
    ]);
    await market.api.board("trending");
    await market.api.board("all_time");
    await market.api.board("hot");

    expect(calls.map((c) => c.url)).toEqual([
      `${MARKETPLACE_URL}/hot`,
      `${MARKETPLACE_URL}/trending`,
      `${MARKETPLACE_URL}/`,
    ]);
    expect(calls[0]?.headers["User-Agent"]).toBe(APP_SLUG);
    await expect(market.api.board("nope" as "hot")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("marks skills the library already has, even on a cached listing", async () => {
    const { fetchImpl } = fakeFetch(() => html(STREAMED_PAGE));
    const market = createMarketService(world.ctx, { store: world.store, fetchImpl });
    expect((await market.api.board("hot")).map((s) => s.installed)).toEqual([false, false]);

    world.store.insert({
      name: "pdf",
      description: null,
      sourceType: "marketplace",
      sourceRef: "acme/skills/pdf",
      libraryPath: "/library/pdf",
      contentHash: "h",
      updateStatus: "up_to_date",
    });
    // Same name from git does not count: only a marketplace install of that id does.
    world.store.insert({
      name: "docx",
      description: null,
      sourceType: "git",
      sourceRef: "acme/skills/docx",
      libraryPath: "/library/docx",
      contentHash: "h2",
      updateStatus: "up_to_date",
    });
    expect((await market.api.board("hot")).map((s) => s.installed)).toEqual([true, false]);
  });

  it("refetches after five minutes and falls back to the old listing when offline", async () => {
    let online = true;
    const { fetchImpl, calls } = fakeFetch(() => {
      if (!online) throw new TypeError("fetch failed");
      return html(PLAIN_PAGE);
    });
    const market = createMarketService(world.ctx, { store: world.store, fetchImpl });
    await market.api.board("hot");

    const age = (ms: number): void => {
      world.ctx.db.run("UPDATE market_cache SET fetched_at = ?", Date.now() - ms);
    };
    age(299_000);
    await market.api.board("hot");
    expect(calls).toHaveLength(1);
    age(301_000);
    await market.api.board("hot");
    expect(calls).toHaveLength(2);

    online = false;
    age(301_000);
    expect((await market.api.board("hot")).map((s) => s.skillId)).toEqual(["pdf", "docx"]);
    await expect(market.api.board("trending")).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("reports HTTP errors and unreadable pages as network failures, without caching them", async () => {
    let body: Response = new Response("nope", { status: 503 });
    const { fetchImpl, calls } = fakeFetch(() => body.clone());
    const market = createMarketService(world.ctx, { store: world.store, fetchImpl });
    await expect(market.api.board("hot")).rejects.toMatchObject({
      code: "NETWORK",
      message: expect.stringContaining("503"),
    });
    body = html("<html>redesigned</html>");
    await expect(market.api.board("hot")).rejects.toMatchObject({ code: "NETWORK" });
    body = html(NEXT_DATA_PAGE);
    expect(await market.api.board("hot")).toHaveLength(2);
    expect(calls).toHaveLength(3);
  });

  it("maps a timeout to TIMEOUT", async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const market = createMarketService(world.ctx, { store: world.store, fetchImpl });
    await expect(market.api.board("hot")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("searches with an encoded query and a capped limit", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ skills: [PDF, DOCX, PDF] }));
    const market = createMarketService(world.ctx, { store: world.store, fetchImpl });

    expect(await market.api.search("   ")).toEqual([]);
    expect(calls).toEqual([]);

    const found = await market.api.search(" pdf & more ", 1);
    expect(found).toEqual([{ id: "acme/skills/pdf", ...PDF, installed: false }]);
    await market.api.search("x", 100_000);
    await market.api.search("x");
    expect(calls.map((c) => c.url)).toEqual([
      `${MARKETPLACE_URL}/api/search?q=pdf%20%26%20more&limit=1`,
      `${MARKETPLACE_URL}/api/search?q=x&limit=200`,
      `${MARKETPLACE_URL}/api/search?q=x&limit=50`,
    ]);
  });

  it("accepts a bare array from search and rejects an answer that is not JSON", async () => {
    let body: Response = json([PDF]);
    const { fetchImpl } = fakeFetch(() => body.clone());
    const market = createMarketService(world.ctx, { store: world.store, fetchImpl });
    expect((await market.api.search("pdf")).map((s) => s.id)).toEqual(["acme/skills/pdf"]);
    body = html("<html>not json</html>");
    await expect(market.api.search("pdf")).rejects.toMatchObject({ code: "NETWORK" });
  });
});
