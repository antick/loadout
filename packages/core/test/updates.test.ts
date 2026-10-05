import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelled } from "../src/errors";
import { updateProgressKey } from "@loadout/shared";
import { writeFile, rejection } from "./helpers";
import { commitAll, git, leftoverCheckouts } from "./install-fixtures";
import {
  MARKET_SOURCE,
  type UpdatesWorld,
  changePdfUpstream,
  createUpdatesWorld,
  pdfInRemote,
} from "./updates-world";

let world: UpdatesWorld;

beforeEach(() => {
  world = createUpdatesWorld();
});
afterEach(() => world.restore());

function changePdfUpstreamAt(dir: string): string {
  writeFile(join(dir, "scripts", "run.sh"), "echo moved\n");
  return commitAll(world.remote, "pdf: moved");
}

describe("check", () => {
  it("tells up to date from update available, and keeps the answer for the TTL", async () => {
    const pdf = await world.installFromGit("pdf");
    const head = git(world.remote, "rev-parse", "HEAD");
    const same = await world.updates.api.check(pdf.id, true);
    expect(same).toMatchObject({ updateStatus: "up_to_date", remoteRevision: head });
    expect(same.updatedAt).toBe(pdf.updatedAt);

    const next = changePdfUpstream(world);
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

  it("offers no update when the commit changed another skill's folder only", async () => {
    const pdf = await world.installFromGit("pdf");
    const docx = await world.installFromGit("docx");
    const next = changePdfUpstream(world);

    const untouched = await world.updates.api.check(docx.id, true);
    expect(untouched).toMatchObject({
      updateStatus: "up_to_date",
      sourceRevision: next,
      remoteRevision: next,
      contentHash: docx.contentHash,
      updatedAt: docx.updatedAt,
    });
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("update_available");
    expect(leftoverCheckouts(world.tmp)).toEqual([]);
  });

  it("reads the folder trees of one repository once per round of checks", async () => {
    await world.installFromGit("pdf");
    await world.installFromGit("docx");
    changePdfUpstream(world);
    let reads = 0;
    const counting = world.withGit({
      folderTrees: (...args) => {
        reads += 1;
        return world.install.git.folderTrees(...args);
      },
    });
    await counting.api.checkAll(true);
    expect(reads).toBe(1);
  });

  it("falls back to the commit when the folder trees cannot be read", async () => {
    const docx = await world.installFromGit("docx");
    changePdfUpstream(world);
    const blind = world.withGit({ folderTrees: async () => new Map() });
    expect((await blind.api.check(docx.id, true)).updateStatus).toBe("update_available");
  });

  it("is unknown without an installed revision", async () => {
    const pdf = await world.installFromGit("pdf");
    world.store.update(pdf.id, { sourceRevision: null });
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("unknown");
  });

  it("installs only the revision the user compared, never a newer one", async () => {
    const pdf = await world.installFromGit("pdf");
    const compared = changePdfUpstream(world, "echo v2\n");
    changePdfUpstream(world, "echo v3, never looked at\n");

    const error = await rejection(
      world.updates.api.update(pdf.id, null, { expectedRevision: compared }),
    );
    expect(error.code).toBe("CHANGED_ON_DISK");
    expect(world.store.get(pdf.id).sourceRevision).toBe(pdf.sourceRevision);
    expect(world.store.get(pdf.id).updateStatus).not.toBe("error");

    const head = (await world.updates.api.sourceDiff(pdf.id)).revision;
    const result = await world.updates.api.update(pdf.id, null, { expectedRevision: head });
    expect(result.skill.sourceRevision).toBe(head);
  });

  it("clears the progress line when an update fails", async () => {
    const pdf = await world.installFromGit("pdf");
    const broken = world.withGit({
      lsRemote: async () => {
        throw new Error("network down");
      },
    });
    await expect(broken.api.update(pdf.id)).rejects.toThrow();
    expect(world.install.progressFor(updateProgressKey(pdf.id)).at(-1)).toBe("done");
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
    changePdfUpstream(world);
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
    const next = changePdfUpstream(world);

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
    // The commit only touched pdf: docx's folder is the same, so it counts as the new commit's.
    expect(world.store.get(docx.id)).toMatchObject({
      updateStatus: "up_to_date",
      sourceRevision: next,
    });
    expect(world.store.get(broken.id).updateStatus).toBe("error");
    expect(world.store.get(fresh.id).updateStatus).toBe("local_only");
  });

  it("checks only the chosen skills, asking their repository once", async () => {
    const pdf = await world.installFromGit("pdf");
    const docx = await world.installFromGit("docx");
    const broken = world.store.update(world.addSkill("broken").id, {
      sourceType: "git",
      sourceUrl: join(world.root, "no-such-repo.git"),
      sourceRevision: "0".repeat(40),
      updateStatus: "unknown",
    });
    changePdfUpstream(world);

    const before = world.lookups();
    const result = await world.updates.api.checkAll(true, {
      skillIds: [pdf.id, docx.id, "gone"],
    });
    expect(world.lookups()).toBe(before + 1);
    expect(result).toEqual({ succeeded: 2, failed: [] });
    expect(world.store.get(pdf.id).updateStatus).toBe("update_available");
    // Not chosen: never looked at.
    expect(world.store.get(broken.id).updateStatus).toBe("unknown");

    const failing = await world.updates.api.checkAll(true, { skillIds: [broken.id] });
    expect(failing.failed.map((failure) => failure.name)).toEqual(["broken"]);
  });
});

describe("update", () => {
  it("swaps the content and keeps the id, name, tags and deployments", async () => {
    const preview = await world.install.api.previewGit(world.remote);
    const [pdf] = await world.install.api.confirmGit(preview.previewId, [
      { relPath: "skills/pdf", name: "My PDF" },
    ]);
    if (!pdf) throw new Error("not installed");
    world.store.setTags(pdf.id, ["docs"]);
    await world.deploy.api.deploy(pdf.id, "claude_code");
    const next = changePdfUpstream(world);

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
    changePdfUpstream(world);

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

  it("marks the skill as gone when its folder left the repository, and keeps it as yours", async () => {
    const pdf = await world.installFromGit("pdf");
    rmSync(pdfInRemote(world), { recursive: true });
    commitAll(world.remote, "drop pdf");
    const error = await rejection(world.updates.api.update(pdf.id));
    expect(error.code).toBe("NOT_FOUND");
    expect(world.store.get(pdf.id).updateStatus).toBe("source_missing");

    const kept = await world.updates.api.detach(pdf.id, { markAuthored: true });
    expect(kept).toMatchObject({
      authored: true,
      sourceType: "local",
      sourceRef: null,
      updateStatus: "local_only",
      lastCheckError: null,
    });
    expect(existsSync(join(pdf.libraryPath, "SKILL.md"))).toBe(true);
    expect(world.ctx.activity.list()[0]).toMatchObject({
      detail: "Detached from its source and marked as yours",
    });
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
    expect(await world.install.api.cancel(updateProgressKey(pdf.id))).toBe(false);
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
    expect(await world.install.api.cancel(updateProgressKey(pdf.id))).toBe(true);
    expect((await pending).code).toBe("CANCELLED");
    // Stopping is not a failure of the source.
    expect(world.store.get(pdf.id).updateStatus).toBe("up_to_date");
    expect(await world.install.api.cancel(updateProgressKey(pdf.id))).toBe(false);
  });
});
