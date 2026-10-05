import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { skillFileLink } from "../src/install/archive-link";
import { crossSiteHost, siteOf } from "../src/install/redirects";
import {
  findWellKnownIndex,
  isSiteCandidate,
  parseWellKnownIndex,
  sha256Digest,
} from "../src/install/well-known";
import { createRequest, downloadWith } from "../src/install/download";
import { leftoverCheckouts, tarBuffer } from "./install-fixtures";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const FILE_LINK = "https://cdn.example.com/skills/pdf/SKILL.md";
const DOCS = "https://docs.example.com/guide";
const DOCS_INDEX = "https://docs.example.com/guide/.well-known/agent-skills/index.json";
const SHOP = "https://shop.example.org";
const SHOP_INDEX = "https://shop.example.org/.well-known/skills/index.json";

function skillMd(name: string, body = ""): string {
  return `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n${body}`;
}

/** A tiny web: bodies by URL, plus redirects answered as the real clients answer them. */
interface Web {
  served: Map<string, Buffer>;
  redirects: Map<string, string>;
  requests: string[];
  fetchImpl: typeof fetch;
}

function createWeb(): Web {
  const served = new Map<string, Buffer>();
  const redirects = new Map<string, string>();
  const requests: string[] = [];
  const answer = (url: string): Response => {
    const body = served.get(url);
    return body ? new Response(body, { status: 200 }) : new Response("", { status: 404 });
  };
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    let url = String(input);
    requests.push(url);
    if (init?.redirect === "manual") {
      const to = redirects.get(url);
      return to ? new Response(null, { status: 302, headers: { location: to } }) : answer(url);
    }
    while (redirects.has(url)) url = redirects.get(url) ?? url;
    return answer(url);
  }) as typeof fetch;
  return { served, redirects, requests, fetchImpl };
}

function json(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

let world: UpdatesWorld;
let web: Web;

beforeEach(() => {
  web = createWeb();
  world = createUpdatesWorld({ fetchImpl: web.fetchImpl });
});

afterEach(() => world.restore());

describe("recognising web sources", () => {
  it("tells a lone SKILL.md link from a page that shows one", () => {
    expect(skillFileLink(` ${FILE_LINK} `)).toBe(FILE_LINK);
    expect(skillFileLink("https://raw.githubusercontent.com/a/b/main/x/skill.md")).not.toBeNull();
    expect(skillFileLink("https://github.com/a/b/blob/main/x/SKILL.md")).toBeNull();
    expect(skillFileLink("https://gitlab.com/a/b/-/blob/main/x/SKILL.md")).toBeNull();
    expect(skillFileLink("https://example.com/README.md")).toBeNull();
  });

  it("only treats plain web addresses as sites that may publish skills", () => {
    expect(isSiteCandidate("https://mintlify.com/docs")).toBe(true);
    expect(isSiteCandidate("https://github.com/acme/skills")).toBe(false);
    expect(isSiteCandidate("https://git.acme.dev/team/skills.git")).toBe(false);
    expect(isSiteCandidate("git@github.com:acme/skills.git")).toBe(false);
    expect(isSiteCandidate("acme/skills")).toBe(false);
  });

  it("compares sites, not hosts, when a download is redirected", () => {
    expect(siteOf("codeload.github.com")).toBe("github.com");
    expect(siteOf("objects.githubusercontent.com")).toBe("github.com");
    expect(siteOf("downloads.example.co.uk")).toBe("example.co.uk");
    // Shared hosting: each subdomain is someone else's site.
    expect(siteOf("alice.github.io")).toBe("alice.github.io");
    expect(siteOf("cdn.alice.github.io")).toBe("alice.github.io");
    expect(crossSiteHost("https://alice.github.io/a.zip", "https://bob.github.io/a.zip")).toBe(
      "bob.github.io",
    );
    expect(
      crossSiteHost("https://github.com/a/b.zip", "https://codeload.github.com/a/b"),
    ).toBeNull();
    expect(crossSiteHost("https://www.example.com/a.zip", "https://example.com/a.zip")).toBeNull();
    expect(crossSiteHost("https://example.com/a.zip", "https://files.other.net/a.zip")).toBe(
      "files.other.net",
    );
  });
});

describe("a link to a SKILL.md", () => {
  it("installs it as a skill of its own and follows the link for updates", async () => {
    web.served.set(FILE_LINK, Buffer.from(skillMd("pdf")));
    const preview = await world.install.api.previewGit(FILE_LINK);
    expect(preview).toMatchObject({ kind: "file", repoUrl: FILE_LINK, redirectedTo: null });
    expect(preview.skills.map((skill) => skill.name)).toEqual(["pdf"]);
    const [pdf] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: preview.skills[0]?.relPath ?? "", name: "" },
    ]);
    if (!pdf) throw new Error("not installed");
    expect(pdf).toMatchObject({ sourceType: "url", sourceRef: FILE_LINK, sourceUrl: FILE_LINK });
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("up_to_date");

    web.served.set(FILE_LINK, Buffer.from(skillMd("pdf", "New section.\n")));
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("update_available");
    await world.updates.api.reimport(pdf.id);
    expect(readFileSync(join(pdf.libraryPath, "SKILL.md"), "utf8")).toContain("New section.");
    expect(leftoverCheckouts(world.tmp)).toEqual([]);
    expect(readdirSync(world.tmp)).toEqual([]);
  });
});

function publishDocs(pdfBody = ""): void {
  const pdf = Buffer.from(skillMd("pdf", pdfBody));
  const tools = gzipSync(
    tarBuffer([
      { name: "SKILL.md", content: skillMd("tools") },
      { name: "scripts/run.sh", content: "#!/bin/sh\n", mode: 0o755 },
    ]),
  );
  web.served.set("https://docs.example.com/guide/skills/pdf.md", pdf);
  web.served.set("https://assets.example.net/tools.tar.gz", tools);
  web.served.set(
    DOCS_INDEX,
    json({
      $schema: SCHEMA,
      skills: [
        {
          name: "pdf",
          type: "skill-md",
          description: "Read PDFs",
          url: "/guide/skills/pdf.md",
          digest: sha256Digest(pdf),
        },
        {
          name: "tools",
          type: "archive",
          description: "Handy tools",
          url: "https://assets.example.net/tools.tar.gz",
          digest: sha256Digest(tools),
        },
        { name: "Bad Name", type: "skill-md", description: "x", url: "/x", digest: "sha256:0" },
      ],
    }),
  );
}

describe("a site that publishes skills", () => {
  it("lists every valid skill of a scoped index and installs the chosen ones", async () => {
    publishDocs();
    const preview = await world.install.api.previewGit(DOCS);
    expect(preview).toMatchObject({ kind: "site", repoUrl: DOCS, redirectedTo: null });
    expect(preview.skills.map((skill) => skill.relPath)).toEqual(["pdf", "tools"]);
    const [tools] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "tools", name: "" },
    ]);
    if (!tools) throw new Error("not installed");
    expect(tools).toMatchObject({
      name: "tools",
      sourceType: "url",
      sourceRef: DOCS,
      sourceUrl: DOCS_INDEX,
      sourceSubpath: "tools",
    });
    expect(readFileSync(join(tools.libraryPath, "scripts", "run.sh"), "utf8")).toBe("#!/bin/sh\n");
    expect((await world.updates.api.check(tools.id, true)).updateStatus).toBe("up_to_date");
    expect(readdirSync(world.tmp)).toEqual([]);
  });

  it("notices a new version, and a skill the site stopped publishing", async () => {
    publishDocs();
    const preview = await world.install.api.previewGit(DOCS);
    const [pdf] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "pdf", name: "" },
    ]);
    if (!pdf) throw new Error("not installed");
    publishDocs("Changed.\n");
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("update_available");

    web.served.set(DOCS_INDEX, json({ $schema: SCHEMA, skills: [] }));
    const gone = await world.updates.api.check(pdf.id, true);
    expect(gone.updateStatus).toBe("error");
    web.served.set(
      DOCS_INDEX,
      json({
        $schema: SCHEMA,
        skills: [
          {
            name: "other",
            type: "skill-md",
            description: "Another",
            url: "/guide/skills/pdf.md",
            digest: sha256Digest(Buffer.from(skillMd("pdf", "Changed.\n"))),
          },
        ],
      }),
    );
    const missing = await world.updates.api.check(pdf.id, true);
    expect(missing.updateStatus).toBe("source_missing");
    expect(missing.lastCheckError).toBe("pdf is no longer published at docs.example.com");
  });

  it("refuses a skill whose download does not match its digest", async () => {
    publishDocs();
    web.served.set("https://docs.example.com/guide/skills/pdf.md", Buffer.from("tampered"));
    const preview = await world.install.api.previewGit(DOCS);
    expect(preview.skills.map((skill) => skill.relPath)).toEqual(["tools"]);
    await world.install.api.cancelPreview(preview.previewId);
  });

  it("reads the older index format, file by file", async () => {
    web.served.set(
      SHOP_INDEX,
      json({
        skills: [
          { name: "orders", description: "Handle orders", files: ["SKILL.md", "ref/api.md"] },
        ],
      }),
    );
    web.served.set(`${SHOP}/.well-known/skills/orders/SKILL.md`, Buffer.from(skillMd("orders")));
    web.served.set(`${SHOP}/.well-known/skills/orders/ref/api.md`, Buffer.from("api\n"));
    const preview = await world.install.api.previewGit(`${SHOP}/`);
    const [orders] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "orders", name: "" },
    ]);
    expect(readFileSync(join(orders?.libraryPath ?? "", "ref", "api.md"), "utf8")).toBe("api\n");
    expect((await world.updates.api.check(orders?.id ?? "", true)).updateStatus).toBe("up_to_date");
  });

  it("refuses an older index whose file list reaches outside the skill's folder", async () => {
    web.served.set(
      SHOP_INDEX,
      json({
        skills: [
          {
            name: "orders",
            description: "Handle orders",
            files: ["SKILL.md", "http://169.254.169.254/latest/meta-data"],
          },
        ],
      }),
    );
    web.served.set(`${SHOP}/.well-known/skills/orders/SKILL.md`, Buffer.from(skillMd("orders")));
    await expect(world.install.api.previewGit(`${SHOP}/`)).rejects.toThrow("outside its folder");
    expect(web.requests.some((url) => url.includes("169.254"))).toBe(false);
  });

  it("drops a plain-http download listed by an https index", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const entry = (url: string) => ({
      name: "pdf",
      type: "skill-md",
      description: "Read PDFs",
      url,
      digest,
    });
    expect(
      parseWellKnownIndex(
        { $schema: SCHEMA, skills: [entry("http://cdn.example.com/a.md")] },
        DOCS_INDEX,
      ),
    ).toBeNull();
    expect(
      parseWellKnownIndex(
        { $schema: SCHEMA, skills: [entry("https://cdn.example.com/a.md")] },
        DOCS_INDEX,
      ),
    ).toHaveLength(1);
  });

  it("does not widen a path to the whole site", async () => {
    web.served.set(
      `${SHOP}/.well-known/agent-skills/index.json`,
      json({ skills: [{ name: "orders", description: "Handle orders", files: ["SKILL.md"] }] }),
    );
    const download = downloadWith(createRequest(web.fetchImpl));
    await expect(findWellKnownIndex(download, `${SHOP}/team/list`)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: `${SHOP} publishes skills, but none below /team/list. Paste ${SHOP} to see them all.`,
    });
    expect(await findWellKnownIndex(download, "https://nothing.example.com")).toBeNull();
  });

  it("asks a host that does not answer once, not at every address an index may be", async () => {
    const asked: string[] = [];
    const offline = (async (input: string | URL) => {
      asked.push(String(input));
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const download = downloadWith(createRequest(offline));
    expect(await findWellKnownIndex(download, `${SHOP}/team/list`)).toBeNull();
    expect(asked).toEqual([`${SHOP}/team/list/.well-known/agent-skills/index.json`]);
    // A 404 is an answer: the next address is still asked.
    web.requests.length = 0;
    expect(await findWellKnownIndex(downloadWith(createRequest(web.fetchImpl)), SHOP)).toBeNull();
    expect(web.requests).toEqual([`${SHOP}/.well-known/agent-skills/index.json`, SHOP_INDEX]);
  });
});

describe("downloads that move to another site", () => {
  const ELSEWHERE = "https://files.elsewhere.net/skills/pdf/SKILL.md";

  it("asks before installing from the other site, and not for a move within one site", async () => {
    web.served.set(FILE_LINK, Buffer.from(skillMd("pdf")));
    web.redirects.set("https://example.com/get/SKILL.md", FILE_LINK);
    // cdn.example.com is part of example.com: nothing to ask.
    const moved = await world.install.api.previewGit("https://example.com/get/SKILL.md");
    expect(moved.redirectedTo).toBeNull();
    await world.install.api.cancelPreview(moved.previewId);

    web.served.set(ELSEWHERE, Buffer.from(skillMd("pdf")));
    const file = "https://example.com/get/other/SKILL.md";
    web.redirects.set(file, ELSEWHERE);
    const preview = await world.install.api.previewGit(file);
    expect(preview.redirectedTo).toBe("files.elsewhere.net");
    const items = [{ relPath: preview.skills[0]?.relPath ?? "", name: "" }];
    await expect(world.install.api.confirmGit(preview.previewId, items)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    // Refusing did not spend the preview: accepting now installs it.
    const [pdf] = await world.install.api.confirmGit(preview.previewId, items, {
      acceptRedirect: true,
    });
    expect(pdf).toMatchObject({ name: "pdf", sourceRef: file });
  });

  it("asks about a site a download only passes through, and updates through it the same way", async () => {
    const link = "https://example.com/get/SKILL.md";
    const through = "https://go.elsewhere.net/r/pdf";
    web.served.set(FILE_LINK, Buffer.from(skillMd("pdf")));
    web.redirects.set(link, through);
    web.redirects.set(through, FILE_LINK);
    const preview = await world.install.api.previewGit(link);
    // Back on the link's own site at the end, yet it went through another one.
    expect(preview.redirectedTo).toBe("go.elsewhere.net");
    const items = [{ relPath: preview.skills[0]?.relPath ?? "", name: "" }];
    const [pdf] = await world.install.api.confirmGit(preview.previewId, items, {
      acceptRedirect: true,
    });
    if (!pdf) throw new Error("not installed");
    expect(pdf.sourceTrustedHost).toBe("go.elsewhere.net");

    // The update follows the very hops the install was agreed for.
    web.served.set(FILE_LINK, Buffer.from(skillMd("pdf", "Changed.\n")));
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("update_available");
  });

  it("refuses at install a download that goes through two other sites, as an update would", async () => {
    const link = "https://example.com/get/SKILL.md";
    const third = "https://cdn.third.org/pdf/SKILL.md";
    web.served.set(third, Buffer.from(skillMd("pdf")));
    web.redirects.set(link, "https://go.elsewhere.net/r/pdf");
    web.redirects.set("https://go.elsewhere.net/r/pdf", third);
    await expect(world.install.api.previewGit(link)).rejects.toThrow(
      "moves on to cdn.third.org after go.elsewhere.net",
    );
    expect(web.requests).not.toContain(third);
  });

  it("holds a site's skill downloads to the same rule as its index", async () => {
    const site = "https://skills.acme.dev";
    const pdfUrl = `${site}/pdf.md`;
    const mirror = "https://mirror.acme-cdn.net/pdf.md";
    const pdf = Buffer.from(skillMd("pdf"));
    const skills = [
      { name: "pdf", type: "skill-md", description: "PDF", url: pdfUrl, digest: sha256Digest(pdf) },
    ];
    web.served.set(
      `${site}/.well-known/agent-skills/index.json`,
      json({ $schema: SCHEMA, skills }),
    );
    web.served.set(mirror, pdf);
    web.redirects.set(pdfUrl, mirror);

    const preview = await world.install.api.previewGit(site);
    expect(preview).toMatchObject({ kind: "site", redirectedTo: "mirror.acme-cdn.net" });
    const [installed] = await world.install.api.confirmGit(
      preview.previewId,
      [{ relPath: "pdf", name: "" }],
      { acceptRedirect: true },
    );
    if (!installed) throw new Error("not installed");
    expect(installed.sourceTrustedHost).toBe("mirror.acme-cdn.net");
    expect((await world.updates.api.check(installed.id, true)).updateStatus).toBe("up_to_date");

    // The skill's file moved on to a site nobody agreed to: the update refuses it.
    web.redirects.set(pdfUrl, "https://evil.example/pdf.md");
    const refused = await world.updates.api.check(installed.id, true);
    expect(refused.lastCheckError).toContain("now leads to evil.example");
    expect(web.requests).not.toContain("https://evil.example/pdf.md");
  });

  it("asks before a site whose index moved elsewhere, then updates from there only", async () => {
    const site = "https://skills.acme.dev";
    const moved = "https://acme-skills.pages.dev/.well-known/agent-skills/index.json";
    const pdfUrl = "https://acme-skills.pages.dev/pdf.md";
    const publish = (body: string): void => {
      const pdf = Buffer.from(skillMd("pdf", body));
      web.served.set(pdfUrl, pdf);
      const skills = [
        {
          name: "pdf",
          type: "skill-md",
          description: "PDF",
          url: pdfUrl,
          digest: sha256Digest(pdf),
        },
      ];
      web.served.set(moved, json({ $schema: SCHEMA, skills }));
    };
    publish("");
    web.redirects.set(`${site}/.well-known/agent-skills/index.json`, moved);

    const preview = await world.install.api.previewGit(site);
    expect(preview).toMatchObject({ kind: "site", redirectedTo: "acme-skills.pages.dev" });
    const items = [{ relPath: "pdf", name: "" }];
    await expect(world.install.api.confirmGit(preview.previewId, items)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const [pdf] = await world.install.api.confirmGit(preview.previewId, items, {
      acceptRedirect: true,
    });
    if (!pdf) throw new Error("not installed");
    expect(pdf).toMatchObject({ sourceTrustedHost: "acme-skills.pages.dev" });

    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("up_to_date");
    publish("Changed.\n");
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("update_available");

    // Moved on again to a site nobody agreed to: refused, nothing fetched from there.
    web.redirects.set(`${site}/.well-known/agent-skills/index.json`, "https://evil.example/i.json");
    const refused = await world.updates.api.check(pdf.id, true);
    expect(refused.updateStatus).toBe("error");
    expect(refused.lastCheckError).toContain("now leads to evil.example");
    expect(web.requests).not.toContain("https://evil.example/i.json");
  });
});
