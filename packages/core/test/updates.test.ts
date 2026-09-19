import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, cancelled } from "../src/errors";
import { LIBRARY_LOCATION, updateCancelKey } from "../src/updates";
import { writeFile } from "./helpers";
import { commitAll, git, leftoverCheckouts } from "./install-fixtures";
import { MARKET_SOURCE, type UpdatesWorld, createUpdatesWorld } from "./updates-world";

let world: UpdatesWorld;

beforeEach(() => {
  world = createUpdatesWorld();
});
afterEach(() => world.restore());

const pdfInRemote = (...parts: string[]): string => join(world.remote, "skills", "pdf", ...parts);

function changePdfUpstream(content = "echo pdf v2\n"): string {
  writeFile(pdfInRemote("scripts", "run.sh"), content);
  return commitAll(world.remote, "pdf: new script");
}

function dropNotesUpstream(): string {
  rmSync(pdfInRemote("notes"), { recursive: true });
  return commitAll(world.remote, "pdf: drop notes");
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("check", () => {
  it("tells up to date from update available, and keeps the answer for the TTL", async () => {
    const pdf = await world.installFromGit("pdf");
    const head = git(world.remote, "rev-parse", "HEAD");
    const same = await world.updates.api.check(pdf.id, true);
    expect(same).toMatchObject({ updateStatus: "up_to_date", remoteRevision: head });
    expect(same.updatedAt).toBe(pdf.updatedAt);

    const next = changePdfUpstream();
    const before = world.lookups();
    // Fresh answer, not forced: nobody is asked.
    expect((await world.updates.api.check(pdf.id)).updateStatus).toBe("up_to_date");
    expect(world.lookups()).toBe(before);

    const checked = await world.updates.api.check(pdf.id, true);
    expect(checked).toMatchObject({
      updateStatus: "update_available",
      sourceRevision: head,
      remoteRevision: next,
      lastCheckError: null,
    });

    // Past the TTL an unforced check looks again.
    world.store.update(pdf.id, { lastCheckedAt: Date.now() - 2 * 60 * 60_000 });
    await world.updates.api.check(pdf.id);
    expect(world.lookups()).toBe(before + 2);
  });

  it("is unknown without an installed revision", async () => {
    const pdf = await world.installFromGit("pdf");
    world.store.update(pdf.id, { sourceRevision: null });
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("unknown");
  });

  it("records a failed lookup and keeps the last revision it saw", async () => {
    const pdf = await world.installFromGit("pdf");
    const head = pdf.remoteRevision;
    rmSync(world.remote, { recursive: true });
    const failed = await world.updates.api.check(pdf.id, true);
    expect(failed.updateStatus).toBe("error");
    expect(failed.lastCheckError).toBeTruthy();
    expect(failed.remoteRevision).toBe(head);
    // An error is not an answer: the next unforced check tries again.
    const before = world.lookups();
    await world.updates.api.check(pdf.id);
    expect(world.lookups()).toBe(before + 1);
  });

  it("drops the result when the skill was pointed elsewhere during the lookup", async () => {
    const pdf = await world.installFromGit("pdf");
    changePdfUpstream();
    const updates = world.withGit({
      lsRemote: async (url, options) => {
        world.store.update(pdf.id, { sourceBranch: "other" });
        return world.install.git.lsRemote(url, options);
      },
    });
    const checked = await updates.api.check(pdf.id, true);
    expect(checked).toMatchObject({
      updateStatus: "up_to_date",
      remoteRevision: pdf.remoteRevision,
      sourceBranch: "other",
    });
  });

  it("checks everything with one lookup per repository and reports failures", async () => {
    const pdf = await world.installFromGit("pdf");
    const docx = await world.installFromGit("docx");
    const broken = world.store.update(world.addSkill("broken").id, {
      sourceType: "git",
      sourceUrl: join(world.root, "no-such-repo.git"),
      sourceRevision: "0".repeat(40),
      updateStatus: "unknown",
    });
    const fresh = world.addSkill("plain");
    changePdfUpstream();

    const before = world.lookups();
    const result = await world.updates.api.checkAll();
    // Only the skill without an answer is looked up; the rest were checked moments ago.
    expect(world.lookups()).toBe(before + 1);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toHaveLength(1);

    // Forced: pdf and docx share one lookup, the broken repository is the other.
    const forced = await world.updates.api.checkAll(true);
    expect(world.lookups()).toBe(before + 3);
    expect(forced.succeeded).toBe(3);
    expect(forced.failed.map((failure) => failure.name)).toEqual(["broken"]);
    expect(world.store.get(pdf.id).updateStatus).toBe("update_available");
    expect(world.store.get(docx.id).updateStatus).toBe("update_available");
    expect(world.store.get(broken.id).updateStatus).toBe("error");
    expect(world.store.get(fresh.id).updateStatus).toBe("local_only");
  });
});

describe("update", () => {
  it("swaps the content and keeps the id, name, tags and deployments", async () => {
    const preview = await world.install.api.previewGit(world.remote);
    const [pdf] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "pdf", name: "My PDF" },
    ]);
    if (!pdf) throw new Error("not installed");
    world.store.setTags(pdf.id, ["docs"]);
    await world.deploy.api.deploy(pdf.id, "claude_code");
    const next = changePdfUpstream();

    const result = await world.updates.api.update(pdf.id);
    expect(result).toMatchObject({ contentChanged: true, pendingRemovals: [], approval: null });
    expect(result.skill).toMatchObject({
      id: pdf.id,
      name: "My PDF",
      libraryPath: pdf.libraryPath,
      tags: ["docs"],
      sourceRevision: next,
      remoteRevision: next,
      sourceSubpath: "skills/pdf",
      updateStatus: "up_to_date",
      lastCheckError: null,
    });
    expect(result.skill.contentHash).not.toBe(pdf.contentHash);
    expect(result.skill.deployments.map((d) => d.agentKey)).toEqual(["claude_code"]);
    expect(readFileSync(join(pdf.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo pdf v2\n");
    // The link still leads to the refreshed library folder.
    expect(readFileSync(join(world.claudeTarget("My PDF"), "scripts", "run.sh"), "utf8")).toBe(
      "echo pdf v2\n",
    );
    expect(leftoverCheckouts(world.tmp)).toEqual([]);
    expect(world.ctx.activity.list()[0]).toMatchObject({ kind: "update", subject: "My PDF" });
  });

  it("refreshes copy-mode deployments", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const pdf = await world.installFromGit("pdf");
    await world.deploy.api.deploy(pdf.id, "claude_code");
    changePdfUpstream();

    const { skill } = await world.updates.api.update(pdf.id);
    expect(readFileSync(join(world.claudeTarget("pdf"), "scripts", "run.sh"), "utf8")).toBe(
      "echo pdf v2\n",
    );
    expect(world.store.deployment(pdf.id, "claude_code")).toMatchObject({
      mode: "copy",
      sourceHash: skill.contentHash,
    });
  });

  it("only moves the revisions when the commit touched another skill", async () => {
    const pdf = await world.installFromGit("pdf");
    writeFile(join(world.remote, "skills", "docx", "extra.md"), "more");
    const next = commitAll(world.remote, "docx: extra");
    writeFile(join(pdf.libraryPath, "local-note.md"), "mine");

    const result = await world.updates.api.update(pdf.id);
    expect(result.contentChanged).toBe(false);
    expect(result.skill).toMatchObject({
      sourceRevision: next,
      remoteRevision: next,
      updateStatus: "up_to_date",
      contentHash: pdf.contentHash,
      updatedAt: pdf.updatedAt,
    });
    // No file work at all: even a hand-made note in the library survives.
    expect(existsSync(join(pdf.libraryPath, "local-note.md"))).toBe(true);
  });

  it("finds a marketplace skill by name after its folder moved", async () => {
    const pdf = await world.install.api.fromMarket(MARKET_SOURCE, "pdf");
    git(world.remote, "mv", "skills/pdf", "pdf-moved");
    const next = changePdfUpstreamAt(join(world.remote, "pdf-moved"));
    // The folder keeps the locator only through its frontmatter name.
    const result = await world.updates.api.update(pdf.id);
    expect(result.skill).toMatchObject({ sourceRevision: next, sourceSubpath: "pdf-moved" });
    expect(result.contentChanged).toBe(true);
  });

  it("marks the skill as failed when the repository is gone", async () => {
    const pdf = await world.installFromGit("pdf");
    rmSync(world.remote, { recursive: true });
    await rejection(world.updates.api.update(pdf.id));
    expect(world.store.get(pdf.id)).toMatchObject({ updateStatus: "error" });
    expect(world.ctx.activity.list()[0]).toMatchObject({ kind: "update", ok: false });
    expect(existsSync(join(pdf.libraryPath, "SKILL.md"))).toBe(true);
  });

  it("refuses local skills", async () => {
    const local = world.addSkill("plain");
    const error = await rejection(world.updates.api.update(local.id));
    expect(error).toMatchObject({
      code: "UNSUPPORTED",
      message: "Source type cannot be refreshed",
    });
  });

  it("can be cancelled through the install cancel registry", async () => {
    const pdf = await world.installFromGit("pdf");
    expect(await world.install.api.cancel(updateCancelKey(pdf.id))).toBe(false);
    let asked = false;
    const updates = world.withGit({
      lsRemote: (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(cancelled()));
          asked = true;
        }),
    });
    const pending = rejection(updates.api.update(pdf.id));
    await vi.waitFor(() => expect(asked).toBe(true));
    expect(await world.install.api.cancel(updateCancelKey(pdf.id))).toBe(true);
    expect((await pending).code).toBe("CANCELLED");
    // Stopping is not a failure of the source.
    expect(world.store.get(pdf.id).updateStatus).toBe("up_to_date");
    expect(await world.install.api.cancel(updateCancelKey(pdf.id))).toBe(false);
  });
});

function changePdfUpstreamAt(dir: string): string {
  writeFile(join(dir, "scripts", "run.sh"), "echo moved\n");
  return commitAll(world.remote, "pdf: moved");
}

describe("removal guard", () => {
  it("changes nothing until the exact list is approved", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const pdf = await world.installFromGit("pdf");
    await world.deploy.api.deploy(pdf.id, "claude_code");
    writeFile(join(world.claudeTarget("pdf"), "scratch.txt"), "made by the agent");
    const next = dropNotesUpstream();

    const asked = await world.updates.api.update(pdf.id);
    expect(asked.contentChanged).toBe(true);
    expect(asked.pendingRemovals).toEqual([
      { location: "claude_code", path: "notes/" },
      { location: "claude_code", path: "scratch.txt" },
      { location: LIBRARY_LOCATION, path: "notes/" },
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

  it("asks again when the remote moved after the list was shown", async () => {
    const pdf = await world.installFromGit("pdf");
    dropNotesUpstream();
    const asked = await world.updates.api.update(pdf.id);
    expect(asked.pendingRemovals).toEqual([{ location: LIBRARY_LOCATION, path: "notes/" }]);

    changePdfUpstream("echo pdf v3\n");
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
    dropNotesUpstream();
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
});
