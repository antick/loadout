import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeSkill, writeFile, rejection } from "./helpers";
import { commitAll, leftoverCheckouts } from "./install-fixtures";
import {
  type UpdatesWorld,
  changePdfUpstream,
  createUpdatesWorld,
  dropNotesUpstream,
  pdfInRemote,
} from "./updates-world";
import { REMOVAL_IN_LIBRARY } from "@loadout/shared";

let world: UpdatesWorld;

beforeEach(() => {
  world = createUpdatesWorld();
});
afterEach(() => world.restore());

describe("removal guard", () => {
  it("changes nothing until the exact list is approved", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const pdf = await world.installFromGit("pdf");
    await world.deploy.api.deploy(pdf.id, "claude_code");
    writeFile(join(world.claudeTarget("pdf"), "scratch.txt"), "made by the agent");
    const next = dropNotesUpstream(world);

    const asked = await world.updates.api.update(pdf.id);
    expect(asked.contentChanged).toBe(true);
    expect(asked.pendingRemovals).toEqual([
      { location: "claude_code", path: "notes/", kind: "removed" },
      { location: "claude_code", path: "scratch.txt", kind: "removed" },
      { location: REMOVAL_IN_LIBRARY, path: "notes/", kind: "removed" },
    ]);
    expect(asked.approval).toMatch(/^[0-9a-f]{64}$/);
    // Nothing moved: files, hash and installed revision are as before.
    expect(existsSync(join(pdf.libraryPath, "notes", "old.md"))).toBe(true);
    expect(existsSync(join(world.claudeTarget("pdf"), "scratch.txt"))).toBe(true);
    expect(asked.skill).toMatchObject({
      sourceRevision: pdf.sourceRevision,
      contentHash: pdf.contentHash,
      remoteRevision: next,
      updateStatus: "update_available",
    });
    // No staged or backup folder is left behind to be mistaken for a skill.
    expect(world.store.list()).toHaveLength(1);
    expect(leftoverCheckouts(world.tmp)).toEqual([]);

    const wrong = await world.updates.api.update(pdf.id, "not-the-token");
    expect(wrong.approval).toBe(asked.approval);
    expect(existsSync(join(pdf.libraryPath, "notes", "old.md"))).toBe(true);

    const applied = await world.updates.api.update(pdf.id, asked.approval);
    expect(applied).toMatchObject({ contentChanged: true, pendingRemovals: [], approval: null });
    expect(applied.skill).toMatchObject({ sourceRevision: next, updateStatus: "up_to_date" });
    expect(existsSync(join(pdf.libraryPath, "notes"))).toBe(false);
    expect(existsSync(join(world.claudeTarget("pdf"), "notes"))).toBe(false);
    expect(existsSync(join(world.claudeTarget("pdf"), "scratch.txt"))).toBe(false);
  });

  it("keeps a skill up to date when only a stale copy of it would lose files", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const pdf = await world.installFromGit("pdf");
    await world.deploy.api.deploy(pdf.id, "claude_code");
    writeFile(join(world.claudeTarget("pdf"), "scratch.txt"), "made by the agent");
    // The library moved on since the copy was made: refreshing the copy drops the agent's file.
    writeFile(join(pdf.libraryPath, "more.md"), "edited here\n");
    world.rehash(pdf);

    const asked = await world.updates.api.update(pdf.id);
    expect(asked.contentChanged).toBe(false);
    expect(asked.pendingRemovals).toEqual([
      { location: "claude_code", path: "scratch.txt", kind: "removed" },
    ]);
    // Same revision upstream: no update is shown, and none is held back later.
    expect(asked.skill).toMatchObject({
      sourceRevision: pdf.sourceRevision,
      remoteRevision: pdf.sourceRevision,
      updateStatus: "up_to_date",
    });

    const applied = await world.updates.api.update(pdf.id, asked.approval);
    expect(applied).toMatchObject({ contentChanged: false, pendingRemovals: [] });
    expect(applied.skill.updateStatus).toBe("up_to_date");
    expect(existsSync(join(world.claudeTarget("pdf"), "scratch.txt"))).toBe(false);
    expect(existsSync(join(world.claudeTarget("pdf"), "more.md"))).toBe(true);
  });

  it("says on a dry run what the real update would hold back, and writes nothing", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const pdf = await world.installFromGit("pdf");
    await world.deploy.api.deploy(pdf.id, "claude_code");
    writeFile(join(world.claudeTarget("pdf"), "scratch.txt"), "made by the agent");
    dropNotesUpstream(world);

    const dry = await world.updates.api.update(pdf.id, null, { dryRun: true });
    const asked = await world.updates.api.update(pdf.id);
    expect(dry.pendingRemovals).toEqual(asked.pendingRemovals);
    expect(dry.pendingRemovals).toContainEqual({
      location: "claude_code",
      path: "scratch.txt",
      kind: "removed",
    });

    // Nothing to hold back: a dry run still writes nothing, not even the row.
    const docx = await world.installFromGit("docx");
    const before = world.store.get(docx.id);
    makeSkill(join(world.remote, "skills"), "docx", { body: "second edition" });
    commitAll(world.remote, "docx: second edition");
    const quiet = await world.updates.api.update(docx.id, null, { dryRun: true });
    expect(quiet).toMatchObject({ contentChanged: true, pendingRemovals: [], approval: null });
    expect(world.store.get(docx.id)).toMatchObject({
      sourceRevision: before.sourceRevision,
      contentHash: before.contentHash,
      updateStatus: before.updateStatus,
    });
  });

  it("hands back on a dry run the comparison a preview would show, from one fetch", async () => {
    const pdf = await world.installFromGit("pdf");
    dropNotesUpstream(world);
    const before = world.lookups();
    const dry = await world.updates.api.update(pdf.id, null, { dryRun: true });
    expect(world.lookups()).toBe(before + 1);
    const shown = (await world.updates.api.compareSource(pdf.id, { asLibraryCopy: true })).diff;
    expect(dry.sourceDiff).toEqual(shown);
    expect(dry.sourceDiff?.entries.map((entry) => [entry.path, entry.status])).toEqual([
      ["notes/old.md", "removed"],
    ]);
    // Nothing new upstream: still compared, so edits made here show.
    const docx = await world.installFromGit("docx");
    writeFile(join(docx.libraryPath, "mine.md"), "my notes\n");
    const same = await world.updates.api.update(docx.id, null, { dryRun: true });
    expect(same).toMatchObject({ contentChanged: false, pendingRemovals: [] });
    expect(same.sourceDiff?.entries.map((entry) => [entry.path, entry.status])).toEqual([
      ["mine.md", "removed"],
    ]);
  });

  it("writes nothing when a dry run fails, not even the failure", async () => {
    const pdf = await world.installFromGit("pdf");
    const before = world.store.get(pdf.id);
    const history = world.ctx.activity.list().length;
    rmSync(pdfInRemote(world), { recursive: true });
    commitAll(world.remote, "drop pdf");
    const gone = await rejection(world.updates.api.update(pdf.id, null, { dryRun: true }));
    expect(gone.code).toBe("NOT_FOUND");
    rmSync(world.remote, { recursive: true });
    await rejection(world.updates.api.update(pdf.id, null, { dryRun: true }));
    expect(world.store.get(pdf.id)).toEqual(before);
    expect(world.ctx.activity.list()).toHaveLength(history);
  });

  it("asks again when the remote moved after the list was shown", async () => {
    const pdf = await world.installFromGit("pdf");
    dropNotesUpstream(world);
    const asked = await world.updates.api.update(pdf.id);
    expect(asked.pendingRemovals).toEqual([
      { location: REMOVAL_IN_LIBRARY, path: "notes/", kind: "removed" },
    ]);

    changePdfUpstream(world, "echo pdf v3\n");
    const again = await world.updates.api.update(pdf.id, asked.approval);
    expect(again.pendingRemovals).toEqual(asked.pendingRemovals);
    expect(again.approval).not.toBe(asked.approval);
    expect(existsSync(join(pdf.libraryPath, "notes", "old.md"))).toBe(true);

    const applied = await world.updates.api.update(pdf.id, again.approval);
    expect(applied.pendingRemovals).toEqual([]);
    expect(readFileSync(join(pdf.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo pdf v3\n");
  });

  it("holds such skills back in a batch, and reports the rest", async () => {
    const pdf = await world.installFromGit("pdf");
    const docx = await world.installFromGit("docx");
    const plain = world.addSkill("plain");
    dropNotesUpstream(world);
    writeFile(join(world.remote, "skills", "docx", "extra.md"), "more");
    commitAll(world.remote, "docx: extra");

    const first = await world.updates.api.updateMany([pdf.id, docx.id, plain.id, "missing-id"]);
    expect(first).toMatchObject({ updated: 1, unchanged: 0, heldBack: ["pdf"] });
    expect(first.failed).toEqual([
      { name: "plain", message: "Source type cannot be refreshed" },
      { name: "missing-id", message: "Skill not found: missing-id" },
    ]);
    expect(existsSync(join(pdf.libraryPath, "notes", "old.md"))).toBe(true);
    expect(existsSync(join(docx.libraryPath, "extra.md"))).toBe(true);

    const second = await world.updates.api.updateMany([docx.id]);
    expect(second).toEqual({ updated: 0, unchanged: 1, heldBack: [], failed: [] });
  });

  it("applies what it would hold back when the batch approves removals", async () => {
    const pdf = await world.installFromGit("pdf");
    dropNotesUpstream(world);

    const result = await world.updates.api.updateMany([pdf.id], { approveRemovals: true });
    expect(result).toEqual({ updated: 1, unchanged: 0, heldBack: [], failed: [] });
    expect(existsSync(join(pdf.libraryPath, "notes", "old.md"))).toBe(false);
  });

  it("updates to what a check just found without asking the remote again", async () => {
    const pdf = await world.installFromGit("pdf");
    changePdfUpstream(world);
    const checkedSince = Date.now();
    await world.updates.api.checkAll(true);
    const found = world.store.get(pdf.id).remoteRevision;

    const before = world.lookups();
    const result = await world.updates.api.updateMany([pdf.id], { checkedSince });
    expect(result).toMatchObject({ updated: 1, failed: [] });
    expect(world.lookups()).toBe(before);
    expect(world.store.get(pdf.id).sourceRevision).toBe(found);
  });

  it("asks the remote when the check is older than the one the caller made", async () => {
    const pdf = await world.installFromGit("pdf");
    changePdfUpstream(world);
    await world.updates.api.checkAll(true);

    const before = world.lookups();
    await world.updates.api.updateMany([pdf.id], { checkedSince: Date.now() + 1 });
    expect(world.lookups()).toBe(before + 1);
  });
});
