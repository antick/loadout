import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { duplicatePairKey } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import {
  type SimilarityInput,
  findSimilarPairs,
  findSimilarPairsInSlices,
  nameSimilarity,
} from "../src/duplicates";
import { AppError } from "../src/errors";
import { makeSkill, tempDir, createTestCore } from "./helpers";

const GUIDE = [
  "# PDF tools",
  "",
  "Use this skill to work with PDF files.",
  "",
  "## Steps",
  "1. Open the file.",
  "2. Read the pages with the reader script.",
  "3. Merge or split as asked.",
  "4. Save the result next to the original.",
  "",
  "## Notes",
  "Never overwrite the original file.",
  "Ask before deleting pages.",
].join("\n");

function input(id: string, over: Partial<SimilarityInput> = {}): SimilarityInput {
  return { id, name: id, description: null, document: "", contentHash: null, ...over };
}

describe("comparing names", () => {
  it("is 1 for the same name in any letter case and falls as they differ", () => {
    expect(nameSimilarity("PDF-Tools", "pdf-tools")).toBe(1);
    expect(nameSimilarity("pdf-tools", "pdf-tool")).toBeGreaterThan(0.85);
    expect(nameSimilarity("pdf-tools", "docker")).toBeLessThan(0.3);
    expect(nameSimilarity("", "")).toBe(1);
  });
});

describe("finding skills that may be one", () => {
  it("lists skills with the same files as identical, even when the text differs by nothing else", () => {
    const [pair] = findSimilarPairs([
      input("b", { name: "one", contentHash: "same" }),
      input("a", { name: "two", contentHash: "same" }),
    ]);
    expect(pair).toMatchObject({ a: "a", b: "b", reason: "identical", contentScore: 1 });
    expect(pair?.key).toBe(duplicatePairKey("b", "a"));
  });

  it("lists documents that are mostly the same lines", () => {
    const edited = GUIDE.replace("Ask before deleting pages.", "Ask first, then delete pages.");
    const [pair] = findSimilarPairs([
      input("a", { name: "pdf-tools", document: GUIDE }),
      input("b", { name: "acrobat-helper", document: edited }),
    ]);
    expect(pair?.reason).toBe("content");
    expect(pair?.contentScore).toBeGreaterThan(0.8);
  });

  it("lists alike names only when the descriptions agree as well", () => {
    const description = "Read, merge and split PDF documents for reports";
    const same = findSimilarPairs([
      input("a", { name: "pdf-tools", description }),
      input("b", { name: "pdf-toolkit", description: `${description} quickly` }),
    ]);
    expect(same).toHaveLength(1);
    expect(same[0]?.reason).toBe("name");

    const different = findSimilarPairs([
      input("a", { name: "pdf-tools", description }),
      input("b", { name: "pdf-tool", description: "Deploy containers to a cluster" }),
    ]);
    expect(different).toEqual([]);
  });

  it("leaves unrelated skills, empty documents and no-hash skills alone", () => {
    expect(
      findSimilarPairs([
        input("a", { name: "pdf-tools", document: GUIDE }),
        input("b", { name: "docker", document: "# Docker\n\nBuild images.\nPush them." }),
        input("c", { name: "empty-one" }),
        input("d", { name: "empty-two" }),
      ]),
    ).toEqual([]);
  });

  it("puts identical copies first, then the closest documents", () => {
    const close = GUIDE.replace("Ask before deleting pages.", "Ask first.");
    const farther = `${GUIDE}\n\n## Extra\nOne more section.\nAnd another.\nAnd a third.\nAnd a fourth.`;
    const pairs = findSimilarPairs([
      input("a", { document: GUIDE }),
      input("b", { document: close }),
      input("c", { document: farther }),
      input("x", { contentHash: "h" }),
      input("y", { contentHash: "h" }),
    ]);
    expect(pairs[0]?.reason).toBe("identical");
    const scores = pairs.slice(1).map((pair) => pair.contentScore);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
    expect(pairs.length).toBeGreaterThanOrEqual(3);
  });
});

const steps = (count: number, label: string): string[] =>
  Array.from({ length: count }, (_, i) => `${label} step ${i}: do part ${i} of the job.`);
const rewrite = (base: string[], every: number, tag: string): string[] =>
  base.map((line, i) => (i % every === 0 ? `${tag} rewrote line ${i}.` : line));
const skill = (
  id: string,
  name: string,
  document: string[],
  over: Partial<SimilarityInput> = {},
): SimilarityInput =>
  input(id, {
    name,
    description: "Review a change before it is merged",
    document: document.join("\n"),
    contentHash: `hash-${id}`,
    ...over,
  });

describe("comparing a whole library", () => {
  it("finds the same pairs, with the same scores, as comparing every pair in full", () => {
    const base = ["# Review", "", ...steps(60, "Review")];
    const big = steps(2100, "Big");
    const pairs = findSimilarPairs([
      skill("a", "review", base),
      skill("b", "code-check", rewrite(base, 6, "b")),
      skill("c", "reviews", rewrite(base, 2, "c")),
      // Every line in common but in the opposite order: alike by lines, not by text.
      skill("d", "backwards", base.toReversed(), { description: "Something else" }),
      skill("e", "same-one", ["# Same"], { contentHash: "same" }),
      skill("f", "same-two", ["# Other text"], { contentHash: "same" }),
      skill("g", "deploy", steps(20, "Deploy"), { description: "Ship containers to the cluster" }),
      // Past the size compared in order: lines in common in any order.
      skill("h", "big", big),
      skill("i", "big-copy", [...big.slice(100), ...big.slice(0, 100)]),
      skill("j", "deploys", steps(20, "Other"), { description: "Ship containers to the cluster" }),
      skill("k", "empty", [], { contentHash: null }),
    ]);
    // Worked out by the full comparison of every pair, before it was made faster.
    expect(pairs.map((pair) => [pair.key, pair.reason, pair.contentScore, pair.nameScore])).toEqual(
      [
        ["e:f", "identical", 1, 0.625],
        ["h:i", "content", 1, 0.375],
        ["a:b", "content", 0.819672131147541, 0.19999999999999996],
        ["a:c", "name", 0.4918032786885246, 0.8571428571428572],
        ["g:j", "name", 0, 0.8571428571428572],
      ],
    );
  });

  it("lets other work run while it compares, and finds the same pairs", async () => {
    const base = steps(200, "Template");
    const library = Array.from({ length: 80 }, (_, k) =>
      skill(`s${k}`, `review-${k}`, rewrite(base, 5, `s${k}`)),
    );
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 0);
    const sliced = await findSimilarPairsInSlices(library);
    const tickedBeforeDone = ticked;
    clearTimeout(timer);
    expect(tickedBeforeDone).toBe(true);
    expect(sliced).toEqual(findSimilarPairs(library));
    expect(sliced).toHaveLength((80 * 79) / 2);
  });
});

describe("looking without the text", () => {
  it("finds the same files and alike names, never alike documents", () => {
    const description = "Read, merge and split PDF documents for reports";
    const pairs = findSimilarPairs(
      [
        input("a", { name: "one", contentHash: "same", document: GUIDE }),
        input("b", { name: "two", contentHash: "same", document: GUIDE }),
        input("c", { name: "pdf-tools", description, document: GUIDE }),
        input("d", { name: "pdf-toolkit", description, document: `${GUIDE}\nMore.` }),
        input("e", { name: "acrobat-helper", document: GUIDE }),
      ],
      { similarText: false },
    );
    expect(pairs.map((pair) => [pair.key, pair.reason, pair.contentScore])).toEqual([
      ["a:b", "identical", 1],
      ["c:d", "name", 0],
    ]);
  });

  it("stops between slices once a newer look is wanted", async () => {
    const base = steps(200, "Template");
    const library = Array.from({ length: 80 }, (_, k) =>
      skill(`s${k}`, `review-${k}`, rewrite(base, 5, `s${k}`)),
    );
    let wanted = true;
    let asked = 0;
    const look = findSimilarPairsInSlices(library, {
      stillWanted: () => {
        asked += 1;
        return wanted;
      },
    });
    wanted = false;
    expect(await look).toBeNull();
    expect(asked).toBe(1);
  });
});

describe("duplicates in a library", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  let source: string;

  beforeEach(() => {
    temp = tempDir();
    core = createTestCore({
      homeDir: temp.dir,
    });
    source = join(temp.dir, "src");
    mkdirSync(join(temp.dir, ".claude"), { recursive: true });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  async function install(name: string, body: string, description = "Work with PDF files well") {
    return core.api.install.fromPath(makeSkill(source, name, { body, description }));
  }

  it("finds a copy under another name and hides it once dismissed", async () => {
    const a = await install("pdf-tools", GUIDE);
    const b = await install("pdf-helper", GUIDE.replace("Ask before", "Always ask before"));
    await install("docker", "# Docker\n\nBuild images.\nPush them.", "Ship containers");

    const found = await core.api.duplicates.find({ similarText: true });
    expect(found.pairs).toHaveLength(1);
    expect(new Set([found.pairs[0]?.a, found.pairs[0]?.b])).toEqual(new Set([a.id, b.id]));

    await core.api.duplicates.dismiss(b.id, a.id);
    expect((await core.api.duplicates.find()).pairs).toEqual([]);
    const withDismissed = await core.api.duplicates.find({
      includeDismissed: true,
      similarText: true,
    });
    expect(withDismissed.pairs[0]?.dismissed).toBe(true);
    expect(withDismissed.dismissedCount).toBe(1);

    await core.api.duplicates.undismiss(a.id, b.id);
    expect((await core.api.duplicates.find()).pairs).toHaveLength(1);
  });

  it("notices a skill added or removed since the last look", async () => {
    const look = () => core.api.duplicates.find({ similarText: true });
    await install("pdf-tools", GUIDE);
    expect((await look()).pairs).toEqual([]);
    const copy = await install("pdf-helper", GUIDE);
    expect((await look()).pairs).toHaveLength(1);
    expect((await look()).pairs).toHaveLength(1);
    await core.api.skills.removeMany([copy.id]);
    expect((await look()).pairs).toEqual([]);
  });

  it("compares the text only when asked, and remembers that it did", async () => {
    await install("pdf-tools", GUIDE);
    await install("pdf-helper", GUIDE);
    expect(await core.api.duplicates.find()).toMatchObject({ pairs: [], similarText: false });
    const full = await core.api.duplicates.find({ similarText: true });
    expect(full).toMatchObject({ similarText: true, pairs: [{ reason: "content" }] });
    // The look at the text answers a quick question about the same library.
    expect(await core.api.duplicates.find()).toEqual(full);
  });

  it("runs one look at a time: a newer one stops the one under way and answers both", async () => {
    const base = steps(200, "Template");
    const skills = [];
    for (let k = 0; k < 40; k += 1) {
      skills.push(await install(`review-${k}`, rewrite(base, 5, `s${k}`).join("\n")));
    }
    const first = core.api.duplicates.find({ similarText: true });
    const gone = skills[0]?.id ?? "";
    await core.api.skills.removeMany([gone]);
    const second = core.api.duplicates.find({ similarText: true });
    const [older, newer] = await Promise.all([first, second]);
    expect(older).toEqual(newer);
    expect(newer.pairs.some((pair) => pair.a === gone || pair.b === gone)).toBe(false);
    expect(newer.pairs).toHaveLength((39 * 38) / 2);
  });

  it("forgets a dismissal when one of the skills is deleted", async () => {
    const a = await install("pdf-tools", GUIDE);
    const b = await install("pdf-helper", GUIDE);
    await core.api.duplicates.dismiss(a.id, b.id);
    await core.api.skills.removeMany([b.id]);
    expect((await core.api.duplicates.find()).dismissedCount).toBe(0);
  });

  it("refuses unknown skills and a skill against itself", async () => {
    const a = await install("pdf-tools", GUIDE);
    await expect(core.api.duplicates.dismiss(a.id, "nope")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(core.api.duplicates.dismiss(a.id, a.id)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(core.api.duplicates.merge(a.id, a.id)).rejects.toBeInstanceOf(AppError);
  });

  it("keeps one skill and carries the other's tags, presets and agents over", async () => {
    const keep = await install("pdf-tools", GUIDE);
    const drop = await install("pdf-helper", GUIDE);
    await core.api.skills.setTags(keep.id, ["docs"]);
    await core.api.skills.setTags(drop.id, ["docs", "office"]);
    const preset = await core.api.presets.create({ name: "Office" });
    await core.api.presets.addSkills(preset.id, [drop.id]);
    await core.api.deploy.deploy(drop.id, "claude_code");
    const dropTarget = join(temp.dir, ".claude", "skills", "pdf-helper");
    expect(existsSync(dropTarget)).toBe(true);

    const result = await core.api.duplicates.merge(keep.id, drop.id);

    expect(result).toMatchObject({
      keptId: keep.id,
      removedId: drop.id,
      tagsAdded: 1,
      presetsJoined: 1,
      deployedTo: ["claude_code"],
      blockedFor: [],
    });
    expect(result.removedEntryId).not.toBeNull();
    const kept = await core.api.skills.get(keep.id);
    expect(kept.tags.sort()).toEqual(["docs", "office"]);
    expect(kept.deployments.map((entry) => entry.agentKey)).toEqual(["claude_code"]);
    expect((await core.api.presets.list())[0]?.skillIds).toEqual([keep.id]);
    expect(existsSync(join(temp.dir, ".claude", "skills", "pdf-tools"))).toBe(true);
    expect(existsSync(dropTarget)).toBe(false);
    await expect(core.api.skills.get(drop.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("previews a merge without changing anything, and refuses what it would refuse", async () => {
    const keep = await install("pdf-tools", GUIDE);
    const drop = await install("pdf-helper", GUIDE);
    await core.api.skills.setTags(drop.id, ["office"]);
    await core.api.deploy.deploy(drop.id, "claude_code");

    const preview = await core.api.duplicates.merge(keep.id, drop.id, { dryRun: true });

    expect(preview).toMatchObject({
      tagsAdded: 1,
      deployedTo: ["claude_code"],
      removedEntryId: null,
    });
    expect((await core.api.skills.get(keep.id)).tags).toEqual([]);
    expect((await core.api.skills.get(drop.id)).id).toBe(drop.id);
    expect(existsSync(join(temp.dir, ".claude", "skills", "pdf-tools"))).toBe(false);

    makeSkill(join(temp.dir, ".claude", "skills"), "pdf-tools");
    await expect(
      core.api.duplicates.merge(keep.id, drop.id, { dryRun: true }),
    ).rejects.toMatchObject({ code: "TARGET_CONFLICT" });
  });

  it("does not deploy the kept skill where it is blocked, and says so", async () => {
    const keep = await install("pdf-tools", GUIDE);
    const drop = await install("pdf-helper", GUIDE);
    await core.api.deploy.deploy(drop.id, "claude_code");
    await core.api.deploy.setBlocked(keep.id, ["claude_code"], true);

    const result = await core.api.duplicates.merge(keep.id, drop.id);

    expect(result.deployedTo).toEqual([]);
    expect(result.blockedFor).toEqual(["claude_code"]);
    expect(existsSync(join(temp.dir, ".claude", "skills", "pdf-tools"))).toBe(false);
  });

  it("removes nothing when the kept skill cannot go where the other was", async () => {
    const keep = await install("pdf-tools", GUIDE);
    const drop = await install("pdf-helper", GUIDE);
    await core.api.deploy.deploy(drop.id, "claude_code");
    // A folder Loadout did not create sits where the kept skill would be deployed.
    makeSkill(join(temp.dir, ".claude", "skills"), "pdf-tools");

    await expect(core.api.duplicates.merge(keep.id, drop.id)).rejects.toMatchObject({
      code: "TARGET_CONFLICT",
    });

    expect((await core.api.skills.get(drop.id)).id).toBe(drop.id);
    expect(existsSync(join(temp.dir, ".claude", "skills", "pdf-helper"))).toBe(true);
    expect(existsSync(join(temp.dir, ".claude", "skills", "pdf-tools", "SKILL.md"))).toBe(true);
  });
});
