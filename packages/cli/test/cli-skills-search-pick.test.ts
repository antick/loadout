import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import type { PickRequest, SkillPicker } from "../src/picker/state";
import { EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Sandbox, createSandbox } from "./harness";

const OWNER = "acme";
const GOOD = "tidy-notes";
/** Listed by the search, but its download is gone. */
const GONE = "lost-skill";

function zip(files: Record<string, string>): Response {
  const bytes = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
  );
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/zip" } });
}

const skillBody = (slug: string): string =>
  `---\nname: ${slug}\ndescription: Keeps ${slug} tidy\n---\n\n# ${slug}\n`;

function item(slug: string) {
  return {
    ownerHandle: OWNER,
    slug,
    displayName: slug,
    summary: `About ${slug}.`,
    stats: { installs: 1200, downloads: 5000 },
    latestVersion: { version: "1.0.0" },
    score: 1,
  };
}

/** A ClawHub registry with two skills, only one of which can be downloaded. */
const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
  const { pathname, searchParams } = new URL(String(input));
  const path = pathname.replace("/api/v1", "");
  if (path === "/search") return Response.json({ results: [item(GOOD), item(GONE)] });
  const slug = path.split("/")[2] ?? searchParams.get("slug") ?? "";
  if (path === `/skills/${slug}`) {
    return Response.json({
      skill: { slug, displayName: slug, description: skillBody(slug) },
      latestVersion: { version: "1.0.0", changelog: "First." },
      owner: { handle: OWNER },
    });
  }
  if (path === `/skills/${slug}/scan`) return Response.json({ security: { status: "clean" } });
  if (path === "/download" && searchParams.get("slug") === GOOD) {
    return zip({ "SKILL.md": skillBody(GOOD) });
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;

let sandbox: Sandbox | undefined;
afterEach(() => sandbox?.cleanup());

/** A sandbox whose picker records what it was shown and ticks what `choose` returns. */
function withPicker(choose: (request: PickRequest) => string[] | null): {
  box: Sandbox;
  asked: PickRequest[];
} {
  const asked: PickRequest[] = [];
  const picker: SkillPicker = async (request) => {
    asked.push(request);
    return choose(request);
  };
  sandbox = createSandbox({ fetchImpl, picker });
  return { box: sandbox, asked };
}

const search = (box: Sandbox, ...extra: string[]) =>
  box.cli("skills", "search", "tidy", "--on", "clawhub", ...extra);

describe("skills search in a terminal", () => {
  it("offers the results with nothing ticked and installs what is ticked", async () => {
    const { box, asked } = withPicker((request) =>
      request.skills.filter((row) => row.name === GOOD).map((row) => row.relPath),
    );
    const run = await search(box);
    expect(run.stdout + run.stderr).toContain("Installed 1 skill");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain(`  ${GOOD} (`);
    expect(run.stdout).toContain("Installing does not deploy");

    const request = asked[0];
    expect(request?.source).toBe('ClawHub results for "tidy"');
    expect(request?.selected).toEqual([]);
    expect(request?.skills.map((row) => [row.relPath, row.name])).toEqual([
      [`@${OWNER}/${GOOD}`, GOOD],
      [`@${OWNER}/${GONE}`, GONE],
    ]);
    expect(request?.skills[0]?.description).toContain("1.2K installs · About tidy-notes.");

    // What is in the library now is left out of the next picker.
    await search(box);
    expect(asked[1]?.skills.map((row) => row.name)).toEqual([GONE]);
  });

  it("goes on past a skill that fails and says which one", async () => {
    const { box } = withPicker((request) => request.skills.map((row) => row.relPath));
    const run = await search(box);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("Installed 1 skill");
    expect(run.stdout).toContain(`Failed: @${OWNER}/${GONE} - `);
    expect(run.stdout).toContain("skills install <skill>");
    const list = await box.cli("skills", "list", "--json");
    expect(list.json<{ name: string }[]>().map((skill) => skill.name)).toEqual([GOOD]);
  });

  it("takes --accept-risk for one ticked skill only, and installs nothing otherwise", async () => {
    const { box } = withPicker((request) => request.skills.map((row) => row.relPath));
    const run = await search(box, "--accept-risk");
    expect(run.code).toBe(EXIT_USAGE);
    expect(run.stderr).toContain("--accept-risk works on one skill at a time");
    const list = await box.cli("skills", "list", "--json");
    expect(list.json<unknown[]>()).toEqual([]);
    box.cleanup();

    const one = withPicker((request) =>
      request.skills.filter((row) => row.name === GOOD).map((row) => row.relPath),
    );
    expect((await search(one.box, "--accept-risk")).code).toBe(EXIT_OK);
  });

  it("only lists the results when the picker is cancelled", async () => {
    const { box } = withPicker(() => null);
    const run = await search(box);
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain(`@${OWNER}/${GOOD}`);
    expect(run.stdout).toContain("Install one with: skills install <skill>");
    const list = await box.cli("skills", "list", "--json");
    expect(list.json<unknown[]>()).toEqual([]);
  });

  it("refuses --accept-risk when no picker will open, rather than ignoring it", async () => {
    const { box, asked } = withPicker(() => []);
    const json = await search(box, "--accept-risk", "--json");
    expect(json.code).toBe(EXIT_USAGE);
    expect(json.stderr).toContain("--accept-risk");
    expect(asked).toHaveLength(0);

    // No terminal: no picker at all.
    const plain = createSandbox({ fetchImpl });
    const run = await search(plain, "--accept-risk");
    plain.cleanup();
    expect(run.code).toBe(EXIT_USAGE);
    expect(run.stderr).toContain("skills install <skill> --accept-risk");
  });

  it("never opens the picker for --json", async () => {
    const { box, asked } = withPicker(() => []);
    const run = await search(box, "--json");
    expect(run.code).toBe(EXIT_OK);
    expect(asked).toHaveLength(0);
    expect(run.json<{ skills: unknown[] }>().skills).toHaveLength(2);
  });
});
