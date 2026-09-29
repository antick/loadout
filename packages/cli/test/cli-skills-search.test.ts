import type { MarketListing } from "@loadout/shared";
import { afterEach, describe, expect, it } from "vitest";
import { EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Sandbox, createSandbox } from "./harness";

const PDF = { source: "acme/skills", skillId: "pdf", name: "PDF Tools", installs: 1200 };
const DOCX = { source: "acme/skills", skillId: "docx", name: "docx", installs: 35 };

let sandbox: Sandbox | undefined;
afterEach(() => sandbox?.cleanup());

function withMarket(respond: (url: string) => Response | Promise<Response>): {
  box: Sandbox;
  urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    urls.push(String(input));
    return respond(String(input));
  }) as typeof fetch;
  sandbox = createSandbox({ fetchImpl });
  return { box: sandbox, urls };
}

describe("skills search", () => {
  it("lists what the marketplace finds as installable names", async () => {
    const { box, urls } = withMarket(() => Response.json({ skills: [PDF, DOCX] }));
    const run = await box.cli("skills", "search", "pdf", "tools");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toMatch(/acme\/skills@pdf\s+1\.2K/);
    expect(run.stdout).toMatch(/acme\/skills@docx\s+35/);
    expect(run.stdout).toContain("skills install <skill>");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("q=pdf%20tools");
  });

  it("returns the listing as JSON and passes --limit on", async () => {
    const { box, urls } = withMarket(() => Response.json([PDF, DOCX]));
    const run = await box.cli("skills", "search", "pdf", "--limit", "1", "--json");
    expect(run.code).toBe(EXIT_OK);
    const listing = run.json<MarketListing>();
    expect(listing.cachedAt).toBeNull();
    expect(listing.skills).toHaveLength(1);
    expect(listing.skills[0]).toMatchObject({ id: "acme/skills/pdf", installed: false });
    expect(urls[0]).toContain("limit=1");
  });

  it("says when nothing matches", async () => {
    const { box } = withMarket(() => Response.json({ skills: [] }));
    const run = await box.cli("skills", "search", "zzz");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain('No skills on skills.sh match "zzz".');
    expect(run.stdout).not.toContain("skills install");
  });

  it("asks for search words and a sane limit", async () => {
    const { box, urls } = withMarket(() => Response.json([]));
    expect((await box.cli("skills", "search")).code).toBe(EXIT_USAGE);
    expect((await box.cli("skills", "search", "pdf", "--limit", "0")).code).toBe(EXIT_USAGE);
    expect(urls).toHaveLength(0);
  });

  it("shows an earlier answer when offline, and says so", async () => {
    let online = true;
    const { box } = withMarket(() =>
      online ? Response.json([PDF]) : Promise.reject(new Error("offline")),
    );
    await box.cli("skills", "search", "pdf");
    online = false;
    const run = await box.cli("skills", "search", "pdf");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("acme/skills@pdf");
    expect(run.stdout).toContain("could not be reached");
    expect((await box.cli("skills", "search", "never-searched")).code).not.toBe(EXIT_OK);
  });
});
