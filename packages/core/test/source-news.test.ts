import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSourceNewsStore } from "../src/sources";
import { makeSkill } from "./helpers";
import { commitAll, createInstallHarness } from "./install-fixtures";
import { MARKET_SOURCE, type UpdatesWorld, createUpdatesWorld } from "./updates-world";

let world: UpdatesWorld;

beforeEach(() => {
  world = createUpdatesWorld();
});

afterEach(() => world.restore());

/** Put skills into the fixture repository as a new commit. */
function publish(...names: string[]): void {
  for (const name of names) makeSkill(`${world.remote}/skills`, name);
  commitAll(world.remote, `add ${names.join(", ")}`);
}

const newPaths = async (): Promise<string[]> =>
  (await world.updates.api.sourceNews()).flatMap((news) => news.skills.map((s) => s.path));

describe("new skills in a repository", () => {
  it("takes what is there at the first look as known, then reports what arrives", async () => {
    await world.installFromGit("pdf");
    const first = await world.updates.api.checkSources();
    // docx was there when pdf was installed: not news.
    expect(first).toMatchObject({ news: [], added: [], failed: [] });

    publish("xlsx", "pptx");
    const second = await world.updates.api.checkSources();
    expect(second.news).toHaveLength(1);
    expect(second.news[0]?.skills.map((skill) => [skill.path, skill.name])).toEqual([
      ["skills/pptx", "pptx"],
      ["skills/xlsx", "xlsx"],
    ]);
    // No network: the last look is kept.
    expect(await newPaths()).toEqual(["skills/pptx", "skills/xlsx"]);

    // Nothing moved upstream: the repository is not fetched again, the news stays.
    await world.updates.api.checkSources();
    expect(await newPaths()).toEqual(["skills/pptx", "skills/xlsx"]);
  });

  it("finds new skills within an update check, asking each repository once", async () => {
    const pdf = await world.installFromGit("pdf");
    await world.updates.api.checkSources();
    publish("xlsx");
    const before = world.lookups();
    const result = await world.updates.api.checkAll(true, { skillIds: [pdf.id], newSkills: true });
    expect(world.lookups() - before).toBe(1);
    // Only the repository moved, not pdf's own folder: no update, but news.
    expect(result.updateAvailable).toEqual([]);
    expect(result.sources?.news[0]?.skills.map((skill) => skill.path)).toEqual(["skills/xlsx"]);
    // Without the option, an update check leaves the news alone.
    expect((await world.updates.api.checkAll(true)).sources).toBeUndefined();
  });

  it("forgets skills an import listed but skipped, and those dismissed", async () => {
    await world.installFromGit("pdf");
    await world.updates.api.checkSources();
    publish("xlsx", "pptx", "csv");
    await world.updates.api.checkSources();

    // Import xlsx from a list showing every skill: pptx and csv were seen and skipped.
    const install = createInstallHarness(world, { sourceNews: createSourceNewsStore(world.ctx) });
    const preview = await install.api.previewGit(MARKET_SOURCE);
    const xlsx = preview.skills.find((skill) => skill.name === "xlsx");
    await install.api.confirmGit(preview.previewId, [{ relPath: xlsx?.relPath ?? "", name: "" }]);
    expect(await newPaths()).toEqual([]);

    publish("md", "json");
    const [news] = (await world.updates.api.checkSources()).news;
    expect(news?.skills.map((skill) => skill.name)).toEqual(["json", "md"]);
    await world.updates.api.dismissSourceNews(news?.sourceKey ?? "", ["skills/md"]);
    expect(await newPaths()).toEqual(["skills/json"]);
    await world.updates.api.dismissSourceNews(news?.sourceKey ?? "");
    expect(await newPaths()).toEqual([]);
  });

  it("lists skills outside skills/ at import, so they are never news later", async () => {
    makeSkill(`${world.remote}/tools`, "xlsx");
    commitAll(world.remote, "add a skill outside skills/");
    const install = createInstallHarness(world, { sourceNews: createSourceNewsStore(world.ctx) });
    const preview = await install.api.previewGit(MARKET_SOURCE);
    expect(preview.skills.map((skill) => skill.relPath)).toEqual([
      "skills/docx",
      "skills/pdf",
      "tools/xlsx",
    ]);
    await install.api.confirmGit(preview.previewId, [{ relPath: "skills/pdf", name: "" }]);

    publish("csv");
    expect(await newPaths()).toEqual([]);
    await world.updates.api.checkSources();
    expect(await newPaths()).toEqual(["skills/csv"]);
  });

  it("adds new skills by itself when that is switched on, never over a name in use", async () => {
    await world.installFromGit("pdf");
    await world.updates.api.checkSources();
    // A skill of the user's own already holds the name "notes".
    await world.install.api.fromPath(makeSkill(`${world.root}/own`, "notes"));
    world.ctx.settings.set("autoAddNewSkills", true);
    publish("xlsx", "notes");

    const result = await world.updates.api.checkSources();
    expect(result.added).toEqual(["xlsx"]);
    expect(result.news[0]?.skills.map((skill) => skill.name)).toEqual(["notes"]);
    const xlsx = world.store.list().find((skill) => skill.name === "xlsx");
    expect(xlsx).toMatchObject({ sourceType: "git", sourceSubpath: "skills/xlsx" });

    // Added once: the next change upstream does not add it again.
    publish("csv");
    const again = await world.updates.api.checkSources();
    expect(again.added).toEqual(["csv"]);
    expect(world.store.list().filter((skill) => skill.name.startsWith("xlsx"))).toHaveLength(1);
  });

  it("reports a repository it cannot reach and carries on", async () => {
    await world.installFromGit("pdf");
    const broken = world.withGit({
      lsRemote: async () => {
        throw new Error("offline");
      },
    });
    const result = await broken.api.checkSources();
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.message).toContain("offline");
  });

  it("leaves registry skills out: they are not repositories to clone", async () => {
    await world.installFromGit("pdf");
    const dir = makeSkill(`${world.root}/registry`, "self-improving-agent");
    world.store.insert({
      name: "self-improving-agent",
      description: "From ClawHub",
      sourceType: "clawhub",
      sourceRef: "pskoett/self-improving-agent",
      sourceUrl: "https://clawhub.ai/pskoett/skills/self-improving-agent",
      sourceRevision: "1.0.0",
      libraryPath: dir,
      contentHash: null,
      updateStatus: "up_to_date",
    });

    const result = await world.updates.api.checkSources();
    expect(result.failed).toEqual([]);
  });

  it("never counts as a library change: the automatic backup is not pushed back", async () => {
    await world.installFromGit("pdf");
    const scopes: string[] = [];
    const touched = world.ctx.touched;
    world.ctx.touched = (...scope) => {
      scopes.push(...scope);
      touched(...scope);
    };
    await world.updates.api.checkSources();
    publish("xlsx");
    await world.updates.api.checkSources();
    await world.updates.api.dismissSourceNews(
      (await world.updates.api.sourceNews())[0]?.sourceKey ?? "",
    );
    expect(scopes).toContain("sources");
    expect(scopes).not.toContain("skills");
  });
});
