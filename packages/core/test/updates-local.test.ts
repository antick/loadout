import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MARKETPLACE_NAME, type Skill, REMOVAL_IN_LIBRARY } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_DIFF_TEXT_BYTES, diffTrees } from "../src/updates/diff";

import { hashDir } from "../src/util/hash";
import { makeSkill, writeFile, rejection } from "./helpers";
import { commitAll, installArchive, leftoverCheckouts, writeZip } from "./install-fixtures";
import { MARKET_SOURCE, type UpdatesWorld, createUpdatesWorld } from "./updates-world";

let world: UpdatesWorld;
/** A folder on "this machine" that a local skill was installed from. */
let sourceDir: string;

beforeEach(() => {
  world = createUpdatesWorld();
  sourceDir = makeSkill(join(world.root, "work"), "helper", {
    files: { "scripts/run.sh": "echo one\n", "notes/old.md": "old\n" },
  });
});
afterEach(() => world.restore());

const installLocal = (): Promise<Skill> => world.install.api.fromPath(sourceDir);

describe("check of local sources", () => {
  it("compares the source folder with the library", async () => {
    const skill = await installLocal();
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");

    // Only the line endings differ: not worth offering.
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo one\r\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");

    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("update_available");
    expect(world.lookups()).toBe(0);
  });

  it("sees a numbered copy as up to date, and updates it keeping its own name", async () => {
    world.addSkill("helper");
    const skill = await installLocal();
    expect(skill).toMatchObject({ name: "helper-2", dirName: "helper-2" });
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");

    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("update_available");
    const result = await world.updates.api.reimport(skill.id);
    expect(result).toMatchObject({ contentChanged: true, pendingRemovals: [] });
    expect(result.skill).toMatchObject({ name: "helper-2", dirName: "helper-2" });
    expect(readFileSync(join(skill.libraryPath, "SKILL.md"), "utf8")).toContain("name: helper-2");
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo two\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");
  });

  it("does not take an edit of the library copy for a change of the source", async () => {
    const skill = await installLocal();
    // Edited in another editor: the app never saw it.
    writeFile(join(skill.libraryPath, "scripts", "run.sh"), "echo mine\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");
    writeFile(join(sourceDir, "notes", "old.md"), "new upstream notes\n");
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("update_available");
  });

  it("reports a vanished source, and a skill that never had one", async () => {
    const skill = await installLocal();
    rmSync(sourceDir, { recursive: true });
    expect(await world.updates.api.check(skill.id, true)).toMatchObject({
      updateStatus: "source_missing",
      lastCheckError: "Original source path no longer exists",
    });
    const plain = world.addSkill("plain");
    expect((await world.updates.api.check(plain.id, true)).updateStatus).toBe("local_only");
  });

  it("looks inside an archive source", async () => {
    const archive = writeZip(join(world.root, "packed.zip"), {
      "packed/SKILL.md": "---\nname: packed\ndescription: zipped\n---\n",
      "packed/data.txt": "v1",
    });
    const skill = await installArchive(world.install.api, archive);
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("up_to_date");
    writeZip(archive, {
      "packed/SKILL.md": "---\nname: packed\ndescription: zipped\n---\n",
      "packed/data.txt": "v2",
    });
    expect((await world.updates.api.check(skill.id, true)).updateStatus).toBe("update_available");

    const result = await world.updates.api.reimport(skill.id);
    expect(result.contentChanged).toBe(true);
    expect(readFileSync(join(skill.libraryPath, "data.txt"), "utf8")).toBe("v2");
  });

  it("re-imports when asked to update", async () => {
    const skill = await installLocal();
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    const result = await world.updates.api.update(skill.id);
    expect(result).toMatchObject({ contentChanged: true, pendingRemovals: [] });
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo two\n");
  });
});

describe("edits made outside the app", () => {
  it("asks before replacing them, and keeps the edited version in Recently removed", async () => {
    const skill = await installLocal();
    writeFile(join(skill.libraryPath, "scripts", "run.sh"), "echo edited by hand\n");
    writeFile(join(skill.libraryPath, "extra.md"), "added by an agent\n");
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");

    const asked = await world.updates.api.reimport(skill.id);
    expect(asked.pendingRemovals).toEqual([
      { location: REMOVAL_IN_LIBRARY, path: "extra.md", kind: "edited" },
      { location: REMOVAL_IN_LIBRARY, path: "scripts/run.sh", kind: "edited" },
    ]);
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe(
      "echo edited by hand\n",
    );

    const applied = await world.updates.api.reimport(skill.id, asked.approval);
    expect(applied.pendingRemovals).toEqual([]);
    expect(applied.removedIds).toHaveLength(1);
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo two\n");
    expect(existsSync(join(skill.libraryPath, "extra.md"))).toBe(false);

    // The edited version comes back on Restore, and the row follows the folder.
    const [entry] = world.removed.list();
    expect(entry).toMatchObject({
      id: applied.removedIds[0],
      place: "Library",
      reason: "replaced",
    });
    await world.removed.restore(applied.removedIds[0] ?? "");
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe(
      "echo edited by hand\n",
    );
    expect(world.store.get(skill.id).contentHash).toBe(hashDir(skill.libraryPath));
  });

  it("keeps nothing when no edit is replaced", async () => {
    const skill = await installLocal();
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    const applied = await world.updates.api.reimport(skill.id);
    expect(applied).toMatchObject({ contentChanged: true, pendingRemovals: [], removedIds: [] });
    expect(world.removed.list()).toEqual([]);
  });
});

describe("reimport, relink, detach", () => {
  it("re-imports from the original folder, guarding removals", async () => {
    const skill = await installLocal();
    world.store.setTags(skill.id, ["mine"]);
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    rmSync(join(sourceDir, "notes"), { recursive: true });

    const asked = await world.updates.api.reimport(skill.id);
    expect(asked.pendingRemovals).toEqual([
      { location: REMOVAL_IN_LIBRARY, path: "notes/", kind: "removed" },
    ]);
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo one\n");
    // A declined re-import leaves the row exactly as it was.
    expect(world.store.get(skill.id)).toEqual({ ...skill, tags: ["mine"] });

    const applied = await world.updates.api.reimport(skill.id, asked.approval);
    expect(applied).toMatchObject({ contentChanged: true, pendingRemovals: [] });
    expect(applied.skill).toMatchObject({
      id: skill.id,
      tags: ["mine"],
      sourceType: "local",
      sourceRef: sourceDir,
      updateStatus: "local_only",
    });
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo two\n");
    expect(existsSync(join(skill.libraryPath, "notes"))).toBe(false);

    const again = await world.updates.api.reimport(skill.id);
    expect(again.contentChanged).toBe(false);
  });

  it("refuses to re-import without a usable source", async () => {
    const plain = world.addSkill("plain");
    expect((await rejection(world.updates.api.reimport(plain.id))).message).toBe(
      "Local skill is missing its original source path",
    );
    const skill = await installLocal();
    rmSync(sourceDir, { recursive: true });
    // A dry run writes nothing, not even that the source is gone.
    const history = world.ctx.activity.list().length;
    const dry = world.updates.api.reimport(skill.id, null, { dryRun: true });
    expect((await rejection(dry)).code).toBe("NOT_FOUND");
    expect(world.store.get(skill.id)).toEqual(skill);
    expect(world.ctx.activity.list()).toHaveLength(history);
    expect((await rejection(world.updates.api.reimport(skill.id))).code).toBe("NOT_FOUND");
    expect(world.store.get(skill.id).updateStatus).toBe("source_missing");

    const pdf = await world.installFromGit("pdf");
    expect((await rejection(world.updates.api.reimport(pdf.id))).code).toBe("UNSUPPORTED");
    expect((await rejection(world.updates.api.relink(pdf.id, sourceDir))).code).toBe("UNSUPPORTED");
  });

  it("relinks to a new folder and takes its content", async () => {
    const skill = await installLocal();
    const moved = makeSkill(join(world.root, "elsewhere"), "helper", {
      files: { "scripts/run.sh": "echo moved\n" },
    });

    const asked = await world.updates.api.relink(skill.id, moved);
    expect(asked.pendingRemovals).toEqual([
      { location: REMOVAL_IN_LIBRARY, path: "notes/", kind: "removed" },
    ]);
    expect(world.store.get(skill.id).sourceRef).toBe(sourceDir);
    // The token belongs to that folder: it approves nothing for a plain re-import.
    const reimported = await world.updates.api.reimport(skill.id, asked.approval);
    expect(reimported).toMatchObject({ contentChanged: false, pendingRemovals: [] });

    const applied = await world.updates.api.relink(skill.id, moved, asked.approval);
    expect(applied.skill).toMatchObject({
      id: skill.id,
      sourceType: "local",
      sourceRef: moved,
      updateStatus: "local_only",
    });
    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo moved\n");
  });

  it("only relinks to a real skill folder outside the library", async () => {
    const skill = await installLocal();
    const empty = join(world.root, "empty");
    writeFile(join(empty, "readme.txt"), "no marker");
    expect((await rejection(world.updates.api.relink(skill.id, empty))).code).toBe("INVALID_INPUT");
    expect((await rejection(world.updates.api.relink(skill.id, join(empty, "nope")))).code).toBe(
      "NOT_FOUND",
    );
    expect((await rejection(world.updates.api.relink(skill.id, "relative/path"))).code).toBe(
      "INVALID_INPUT",
    );
    const other = world.addSkill("other");
    expect((await rejection(world.updates.api.relink(skill.id, other.libraryPath))).code).toBe(
      "INVALID_INPUT",
    );
  });

  it("detaches a skill from its source and keeps its content", async () => {
    const pdf = await world.installFromGit("pdf");
    // Not an edit: the skill's last changed time stays.
    world.store.update(pdf.id, { updatedAt: 1000 });
    const detached = await world.updates.api.detach(pdf.id);
    expect(detached.updatedAt).toBe(1000);
    expect(detached).toMatchObject({
      id: pdf.id,
      sourceType: "local",
      sourceRef: null,
      sourceUrl: null,
      sourceSubpath: null,
      sourceBranch: null,
      sourceRevision: null,
      remoteRevision: null,
      updateStatus: "local_only",
      contentHash: pdf.contentHash,
    });
    expect(existsSync(join(pdf.libraryPath, "SKILL.md"))).toBe(true);
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("local_only");
  });
});

describe("source preview", () => {
  it("classifies every kind of difference", () => {
    const before = join(world.root, "before");
    const after = join(world.root, "after");
    const big = "x".repeat(MAX_DIFF_TEXT_BYTES + 1);
    for (const [dir, version] of [
      [before, "1"],
      [after, "2"],
    ] as const) {
      writeFile(join(dir, "same.md"), "same");
      writeFile(join(dir, "text.md"), `text ${version}\n`);
      writeFile(join(dir, "big.txt"), big + version);
      writeFileSync(join(dir, "blob.bin"), Buffer.from([0, 1, 2, Number(version)]));
      writeFileSync(join(dir, "latin1.txt"), Buffer.from([0xe9, 0x20, Number(version) + 0x30]));
      writeFile(join(dir, "build.sh"), "#!/bin/sh\n");
      writeFile(join(dir, ".DS_Store"), version);
    }
    writeFile(join(before, "gone/old.md"), "bye");
    writeFile(join(after, "new/fresh.md"), "hello");
    chmodSync(join(after, "build.sh"), 0o755);

    const entries = diffTrees(before, after);
    const summary = entries.map((entry) => [entry.path, entry.status, entry.kind]);
    const expected = [
      ["big.txt", "modified", "too_large"],
      ["blob.bin", "modified", "binary"],
      ["build.sh", "modified", "permission_only"],
      ["gone/old.md", "removed", "text"],
      ["latin1.txt", "modified", "binary"],
      ["new/fresh.md", "added", "text"],
      ["text.md", "modified", "text"],
    ];
    const posix = process.platform !== "win32";
    expect(summary).toEqual(expected.filter(([, , kind]) => posix || kind !== "permission_only"));

    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    expect(byPath.get("text.md")).toMatchObject({ before: "text 1\n", after: "text 2\n" });
    expect(byPath.get("gone/old.md")).toMatchObject({ before: "bye", after: null });
    expect(byPath.get("new/fresh.md")).toMatchObject({ before: null, after: "hello" });
    expect(byPath.get("big.txt")).toMatchObject({ before: null, after: null });
    expect(byPath.get("blob.bin")).toMatchObject({ before: null, after: null });
    if (posix) {
      expect(byPath.get("build.sh")).toMatchObject({
        before: null,
        after: null,
        executableBefore: false,
        executableAfter: true,
      });
    }
  });

  it("diffs and shows a local source straight from its folder", async () => {
    const skill = await installLocal();
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    writeFile(join(sourceDir, "SKILL.md"), "---\nname: helper\n---\n\n# Helper v2\n");

    const diff = await world.updates.api.sourceDiff(skill.id);
    expect(diff).toMatchObject({ skillId: skill.id, sourceLabel: "Local", revision: "workspace" });
    expect(diff.entries.map((entry) => entry.path)).toEqual(["SKILL.md", "scripts/run.sh"]);

    const document = (await world.updates.api.compareSource(skill.id)).document;
    expect(document).toMatchObject({
      filename: "SKILL.md",
      sourceLabel: "Local",
      revision: "workspace",
    });
    expect(document.content).toContain("# Helper v2");
  });

  it("compares a numbered copy as the library keeps it when asked", async () => {
    world.addSkill("helper");
    const skill = await installLocal();
    expect(skill.dirName).toBe("helper-2");
    // Plain: the name line the library rewrote shows as a difference.
    const plain = await world.updates.api.sourceDiff(skill.id);
    expect(plain.entries.map((entry) => entry.path)).toEqual(["SKILL.md"]);
    // As a library copy: nothing an update would change.
    const asCopy = await world.updates.api.sourceDiff(skill.id, { asLibraryCopy: true });
    expect(asCopy.entries).toEqual([]);
    writeFile(join(sourceDir, "scripts", "run.sh"), "echo two\n");
    const changed = await world.updates.api.sourceDiff(skill.id, { asLibraryCopy: true });
    expect(changed.entries.map((entry) => entry.path)).toEqual(["scripts/run.sh"]);
  });

  it("reads git and marketplace sources from a checkout that is always removed", async () => {
    const pdf = await world.installFromGit("pdf");
    const docx = await world.install.api.fromMarket(MARKET_SOURCE, "docx");
    writeFile(join(world.remote, "skills", "pdf", "scripts", "run.sh"), "echo pdf v2\n");
    const next = commitAll(world.remote, "pdf: v2");

    const diff = await world.updates.api.sourceDiff(pdf.id);
    expect(diff).toMatchObject({ sourceLabel: "Git", revision: next });
    expect(diff.entries).toEqual([
      expect.objectContaining({
        path: "scripts/run.sh",
        status: "modified",
        kind: "text",
        before: "echo pdf\n",
        after: "echo pdf v2\n",
      }),
    ]);
    const document = (await world.updates.api.compareSource(docx.id)).document;
    expect(document).toMatchObject({ sourceLabel: MARKETPLACE_NAME, revision: next });
    expect(document.content).toContain("# docx");
    // Looking never changes the library.
    expect(world.store.get(pdf.id)).toEqual(pdf);
    expect(leftoverCheckouts(world.tmp)).toEqual([]);

    rmSync(join(world.remote, "skills", "pdf"), { recursive: true });
    commitAll(world.remote, "pdf: removed");
    expect((await rejection(world.updates.api.sourceDiff(pdf.id))).code).toBe("NOT_FOUND");
    expect(leftoverCheckouts(world.tmp)).toEqual([]);
  });

  it("compares files and the main document from one look at the source", async () => {
    const pdf = await world.installFromGit("pdf");
    writeFile(join(world.remote, "skills", "pdf", "scripts", "run.sh"), "echo pdf v2\n");
    const next = commitAll(world.remote, "pdf: v2");
    let checkouts = 0;
    const counting = world.withGit({
      checkout: (...args) => {
        checkouts += 1;
        return world.install.git.checkout(...args);
      },
    });

    const before = world.lookups();
    const { diff, document } = await counting.api.compareSource(pdf.id);
    expect(world.lookups()).toBe(before + 1);
    expect(checkouts).toBe(1);
    expect(diff).toMatchObject({ skillId: pdf.id, revision: next });
    expect(diff.entries.map((entry) => entry.path)).toEqual(["scripts/run.sh"]);
    expect(document).toMatchObject({ filename: "SKILL.md", revision: next });
    expect(document.content).toContain("# pdf");
    expect(leftoverCheckouts(world.tmp)).toEqual([]);
  });

  it("explains why a skill without a source has nothing to show", async () => {
    const plain = world.addSkill("plain");
    expect((await rejection(world.updates.api.sourceDiff(plain.id))).message).toBe(
      "Local skill is missing its original source path",
    );
  });
});
