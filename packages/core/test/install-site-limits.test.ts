import { readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_INDEX_ENTRIES,
  type SiteBudget,
  parseWellKnownIndex,
  sha256Digest,
} from "../src/install/well-known";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

/** The site budget the next fetch starts with; null keeps the real one. */
const budgetLimit = vi.hoisted(() => ({ bytes: null as number | null }));

vi.mock(import("../src/install/well-known"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    createSiteBudget: (): SiteBudget =>
      budgetLimit.bytes === null
        ? actual.createSiteBudget()
        : { left: budgetLimit.bytes, exceeded: false },
  };
});

const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const SITE = "https://skills.example.com";
const INDEX = `${SITE}/.well-known/agent-skills/index.json`;
const SKILL_COUNT = 6;

function skillMd(name: string): string {
  return `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n`;
}

let world: UpdatesWorld;
let served: Map<string, Buffer>;

/** Publish `count` one-file skills; returns the bytes of one of them. */
function publish(count: number): number {
  const skills = Array.from({ length: count }, (_, index) => {
    const name = `skill-${index}`;
    const body = Buffer.from(skillMd(name));
    served.set(`${SITE}/skills/${name}.md`, body);
    const url = `/skills/${name}.md`;
    return { name, type: "skill-md", description: name, url, digest: sha256Digest(body) };
  });
  served.set(INDEX, Buffer.from(JSON.stringify({ $schema: SCHEMA, skills })));
  return Buffer.byteLength(skillMd("skill-0"));
}

beforeEach(() => {
  budgetLimit.bytes = null;
  served = new Map();
  const fetchImpl = (async (input: string | URL) => {
    const body = served.get(String(input));
    return body ? new Response(body, { status: 200 }) : new Response("", { status: 404 });
  }) as typeof fetch;
  world = createUpdatesWorld({ fetchImpl });
});

afterEach(() => world.restore());

describe("limits on a site's skills", () => {
  it("refuses an index that lists more skills than allowed", async () => {
    const entry = { name: "a", type: "skill-md", description: "a", url: "/a.md" };
    const skill = { ...entry, digest: sha256Digest(Buffer.from("a")) };
    const index = (count: number): unknown => ({
      $schema: SCHEMA,
      skills: Array.from({ length: count }, () => skill),
    });
    expect(parseWellKnownIndex(index(MAX_INDEX_ENTRIES), INDEX)).toHaveLength(MAX_INDEX_ENTRIES);
    expect(() => parseWellKnownIndex(index(MAX_INDEX_ENTRIES + 1), INDEX)).toThrow(
      `more than ${MAX_INDEX_ENTRIES} skills`,
    );

    served.set(INDEX, Buffer.from(JSON.stringify(index(MAX_INDEX_ENTRIES + 1))));
    await expect(world.install.api.previewGit(SITE)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringContaining(`more than ${MAX_INDEX_ENTRIES} skills`),
    });
  });

  it("refuses the whole site when its skills add up to more than allowed", async () => {
    const one = publish(SKILL_COUNT);
    budgetLimit.bytes = one * (SKILL_COUNT - 1);
    await expect(world.install.api.previewGit(SITE)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringContaining("The site's skills add up to more than"),
    });
    expect(readdirSync(world.tmp)).toEqual([]);
  });

  it("takes a site whose skills fit exactly", async () => {
    const one = publish(SKILL_COUNT);
    budgetLimit.bytes = one * SKILL_COUNT;
    const preview = await world.install.api.previewGit(SITE);
    expect(preview.skills).toHaveLength(SKILL_COUNT);
    await world.install.api.cancelPreview(preview.previewId);
    expect(readdirSync(world.tmp)).toEqual([]);
  });
});
