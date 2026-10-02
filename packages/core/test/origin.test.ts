import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MarketListing, Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import { createOriginFinder, linkLeads, remoteUrlOf, textSimilarity } from "../src/origin";
import { gitFolderLead } from "../src/origin/evidence";
import { lockFileLead, lockFilePaths } from "../src/origin/lock";
import { hashDir } from "../src/util/hash";
import { makeSkill, writeFile } from "./helpers";
import { commitAll, git, initRepo } from "./install-fixtures";
import { MARKET_SOURCE, type UpdatesWorld, createUpdatesWorld } from "./updates-world";

let world: UpdatesWorld;

beforeEach(() => {
  world = createUpdatesWorld();
});
afterEach(() => world.restore());

const REPO_URL = `https://github.com/${MARKET_SOURCE}`;
const pdfInRemote = (...parts: string[]): string => join(world.remote, "skills", "pdf", ...parts);

/** The fixture's `pdf` imported from a folder: a skill without a source. */
function importedPdf(options: { body?: string; sourceRef?: string | null } = {}): Skill {
  const libraryPath = join(world.ctx.paths.skillsDir, "pdf");
  cpSync(pdfInRemote(), libraryPath, { recursive: true });
  if (options.body !== undefined) writeFile(join(libraryPath, "SKILL.md"), options.body);
  return world.store.insert({
    name: "pdf",
    description: null,
    sourceType: "import",
    sourceRef: options.sourceRef ?? null,
    libraryPath,
    contentHash: hashDir(libraryPath),
    updateStatus: "local_only",
  });
}

const upstreamDocument = (): string => readFileSync(pdfInRemote("SKILL.md"), "utf8");

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("evidence", () => {
  it("reads the origin remote of a Git config, else the first remote", () => {
    const config = [
      "[core]",
      "\tbare = false",
      '[remote "fork"]',
      "\turl = https://github.com/me/fork.git",
      '[remote "origin"]',
      "\turl = git@github.com:acme/skills.git",
    ].join("\n");
    expect(remoteUrlOf(config)).toBe("git@github.com:acme/skills.git");
    expect(remoteUrlOf('[remote "fork"]\n  url = https://x.test/a/b\n')).toBe("https://x.test/a/b");
    expect(remoteUrlOf("[core]\n")).toBeNull();
  });

  it("finds GitHub links in SKILL.md, keeping folder links and skipping site pages", () => {
    const dir = makeSkill(world.root, "linked", {
      body: [
        "From https://github.com/acme/skills/tree/main/skills/linked.",
        "See [docs](https://github.com/features/actions) and https://github.com/acme/skills.",
        "Script: https://github.com/other/repo/blob/main/scripts/run.sh",
      ].join("\n"),
    });
    expect(linkLeads(dir, "linked").map((lead) => lead.input)).toEqual([
      "https://github.com/acme/skills/tree/main/skills/linked",
      "https://github.com/acme/skills",
      "https://github.com/other/repo",
    ]);
  });

  it("reads a checkout's remote, branch and the folder's place in it, credentials removed", () => {
    const checkout = initRepo(join(world.home, "code", "skills"));
    git(checkout, "remote", "add", "origin", "https://user:secret@github.com/acme/skills.git");
    const folder = makeSkill(join(checkout, "skills"), "pdf");
    expect(gitFolderLead(folder, world.home)).toEqual({
      input: "https://github.com/acme/skills.git",
      evidence: "git_folder",
      branch: "main",
      subpath: "skills/pdf",
    });
  });

  it("never takes a remote that is a folder, or a checkout of the home folder itself", () => {
    const local = initRepo(join(world.home, "code", "local"));
    git(local, "remote", "add", "origin", "/somewhere/else");
    expect(gitFolderLead(makeSkill(local, "one"), world.home)).toBeNull();

    initRepo(world.home);
    git(world.home, "remote", "add", "origin", "https://github.com/me/dotfiles.git");
    const inHome = makeSkill(join(world.home, ".claude", "skills"), "two");
    expect(gitFolderLead(inHome, world.home)).toBeNull();
  });

  it("scores texts by lines shared in order", () => {
    expect(textSimilarity("a\nb\nc\n", "a\r\nb\r\nc")).toBe(1);
    expect(textSimilarity("a\nb\nc\nd", "a\nb\nc\nx")).toBe(0.75);
    expect(textSimilarity("a\nb", "c\nd")).toBe(0);
  });
});

/** What `npx skills add` writes: one entry per installed skill. */
function writeLock(dir: string, skills: Record<string, Record<string, unknown>>): string {
  const path = join(dir, ".skill-lock.json");
  writeFile(path, JSON.stringify({ version: 3, skills }));
  return path;
}

const PDF_LOCK = {
  source: MARKET_SOURCE,
  sourceType: "github",
  sourceUrl: `${REPO_URL}.git`,
  skillPath: "skills/pdf/SKILL.md",
  skillFolderHash: "abc",
};
const homeLockDir = (): string => join(world.home, ".agents");
const noEnv = (): Record<string, string> => ({});

describe("npx skills lock file", () => {
  it("names the repository and the skill's folder in it", () => {
    writeLock(homeLockDir(), { pdf: PDF_LOCK });
    expect(lockFileLead("pdf", world.home, noEnv)).toEqual({
      input: `${REPO_URL}.git`,
      evidence: "skills_lock",
      subpath: "skills/pdf",
    });
  });

  it("gives no folder for a skill at the top of its repository", () => {
    writeLock(homeLockDir(), { herdr: { ...PDF_LOCK, skillPath: "SKILL.md" } });
    expect(lockFileLead("herdr", world.home, noEnv)?.subpath).toBeNull();
  });

  it("reads the file under XDG_STATE_HOME first, then the one in the home folder", () => {
    const state = join(world.root, "state");
    expect(lockFilePaths(world.home, { XDG_STATE_HOME: state })).toEqual([
      join(state, "skills", ".skill-lock.json"),
      join(world.home, ".agents", ".skill-lock.json"),
    ]);
    writeLock(homeLockDir(), { pdf: PDF_LOCK });
    writeLock(join(state, "skills"), {
      pdf: { ...PDF_LOCK, sourceUrl: "https://github.com/other/skills.git" },
    });
    const env = (): Record<string, string> => ({ XDG_STATE_HOME: state });
    expect(lockFileLead("pdf", world.home, env)?.input).toBe("https://github.com/other/skills.git");
    // Only the home file knows this one.
    writeLock(join(state, "skills"), {});
    expect(lockFileLead("pdf", world.home, env)?.input).toBe(`${REPO_URL}.git`);
  });

  it("says nothing without a file, with a broken file, or for a skill it does not list", () => {
    expect(lockFileLead("pdf", world.home, noEnv)).toBeNull();
    writeFile(join(homeLockDir(), ".skill-lock.json"), "{ not json");
    expect(lockFileLead("pdf", world.home, noEnv)).toBeNull();
    writeFile(join(homeLockDir(), ".skill-lock.json"), JSON.stringify({ skills: [] }));
    expect(lockFileLead("pdf", world.home, noEnv)).toBeNull();
    writeLock(homeLockDir(), { pdf: PDF_LOCK });
    expect(lockFileLead("docx", world.home, noEnv)).toBeNull();
    expect(lockFileLead("constructor", world.home, noEnv)).toBeNull();
    expect(lockFileLead("__proto__", world.home, noEnv)).toBeNull();
  });

  it("never takes a folder on disk, an address with a password, or an unknown scheme", () => {
    writeLock(homeLockDir(), {
      folder: { ...PDF_LOCK, sourceType: "local", sourceUrl: "/Users/me/skills" },
      path: { ...PDF_LOCK, sourceUrl: "/Users/me/skills" },
      secret: { ...PDF_LOCK, sourceUrl: "https://user:hunter2@github.com/acme/skills.git" },
      odd: { ...PDF_LOCK, sourceUrl: "ftp://example.test/skills" },
      none: { ...PDF_LOCK, sourceUrl: undefined },
    });
    expect(lockFileLead("folder", world.home, noEnv)).toBeNull();
    expect(lockFileLead("path", world.home, noEnv)).toBeNull();
    expect(lockFileLead("odd", world.home, noEnv)).toBeNull();
    expect(lockFileLead("none", world.home, noEnv)).toBeNull();
    // The password is dropped, not kept: the address itself is still a repository.
    expect(lockFileLead("secret", world.home, noEnv)?.input).toBe(
      "https://github.com/acme/skills.git",
    );
  });

  it("finds the recorded repository and links an identical copy as up to date", async () => {
    const pdf = importedPdf();
    writeLock(homeLockDir(), { pdf: PDF_LOCK });
    const search = await world.updates.api.findSource(pdf.id);
    expect(search.failures).toEqual([]);
    expect(search.candidates).toHaveLength(1);
    expect(search.candidates[0]).toMatchObject({
      label: MARKET_SOURCE,
      subpath: "skills/pdf",
      evidence: "skills_lock",
      match: "identical",
    });
  });

  it("does not trust the file over the repository: a different skill is not called identical", async () => {
    const pdf = importedPdf({
      body: "---\nname: pdf\ndescription: Mine\n---\n\nSomething else entirely.\n",
    });
    writeLock(homeLockDir(), { pdf: PDF_LOCK });
    const [found] = (await world.updates.api.findSource(pdf.id)).candidates;
    expect(found?.evidence).toBe("skills_lock");
    expect(found?.match).not.toBe("identical");
    expect(
      await world.updates.origin.linkIfExact(pdf.id, join(world.home, "elsewhere")),
    ).toBeNull();
    expect(world.store.get(pdf.id).sourceType).toBe("import");
  });

  it("links an import by itself when the lock file names a repository holding the same files", async () => {
    const pdf = importedPdf({ sourceRef: join(world.home, ".agents", "skills", "pdf") });
    writeLock(homeLockDir(), { pdf: PDF_LOCK });
    const linked = await world.updates.origin.linkIfExact(
      pdf.id,
      join(world.home, ".agents", "skills", "pdf"),
    );
    expect(linked).toMatchObject({
      sourceType: "git",
      sourceSubpath: "skills/pdf",
      updateStatus: "up_to_date",
    });
  });
});

describe("find and link a source", () => {
  it("finds the repository SKILL.md links to, and links an identical copy as up to date", async () => {
    const pdf = importedPdf({ body: `${upstreamDocument()}\nFrom ${REPO_URL}\n` });
    writeFile(pdfInRemote("SKILL.md"), `${upstreamDocument()}\nFrom ${REPO_URL}\n`);
    const head = commitAll(world.remote, "pdf: link home");

    const search = await world.updates.api.findSource(pdf.id);
    expect(search.failures).toEqual([]);
    expect(search.candidates).toHaveLength(1);
    const [found] = search.candidates;
    expect(found).toMatchObject({
      label: MARKET_SOURCE,
      subpath: "skills/pdf",
      evidence: "skill_link",
      match: "identical",
      revision: head,
      changedFiles: [],
    });

    const linked = await world.updates.api.attachSource(pdf.id, found!);
    expect(linked).toMatchObject({
      sourceType: "git",
      sourceSubpath: "skills/pdf",
      sourceRevision: head,
      updateStatus: "up_to_date",
      updatedAt: pdf.updatedAt,
    });
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("up_to_date");
  });

  it("links a changed copy as an update that asks before replacing the changes", async () => {
    const pdf = importedPdf();
    writeFile(join(pdf.libraryPath, "scripts", "run.sh"), "echo my own pdf\n");
    world.rehash(pdf);

    const candidate = await world.updates.api.lookUpSource(pdf.id, REPO_URL);
    expect(candidate).toMatchObject({
      evidence: "pasted",
      match: "similar",
      similarity: 1,
      changedFiles: ["scripts/run.sh"],
    });

    const linked = await world.updates.api.attachSource(pdf.id, candidate);
    expect(linked).toMatchObject({ sourceRevision: null, updateStatus: "update_available" });
    // A later check keeps offering it: the installed commit is still unknown.
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("update_available");

    const held = await world.updates.api.update(pdf.id);
    expect(held.pendingRemovals).toEqual([
      { location: "library", path: "scripts/run.sh", kind: "edited" },
    ]);
    expect(readFileSync(join(pdf.libraryPath, "scripts", "run.sh"), "utf8")).toBe(
      "echo my own pdf\n",
    );

    const done = await world.updates.api.update(pdf.id, held.approval);
    expect(done.skill).toMatchObject({ updateStatus: "up_to_date" });
    expect(done.skill.sourceRevision).toBe(git(world.remote, "rev-parse", "HEAD"));
    expect(readFileSync(join(pdf.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo pdf\n");
    expect(done.removedIds).toHaveLength(1);
  });

  it("says which skill it looked for when the repository does not have it", async () => {
    const other = world.addSkill("unheard-of");
    const error = await rejection(world.updates.api.lookUpSource(other.id, REPO_URL));
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toContain('No skill called "unheard-of" in acme/skills');
  });

  it("refuses a skill that already follows a source", async () => {
    const pdf = await world.installFromGit("pdf");
    expect((await rejection(world.updates.api.findSource(pdf.id))).code).toBe("INVALID_INPUT");
  });

  it("refuses to link when the skill changed after it was compared", async () => {
    const pdf = importedPdf();
    const candidate = await world.updates.api.lookUpSource(pdf.id, REPO_URL);
    // The second read of the row happens under the lock, after the comparison.
    let reads = 0;
    const store = new Proxy(world.store, {
      get(target, property) {
        if (property === "get") {
          return (id: string) => {
            reads += 1;
            if (reads === 2) writeFile(join(pdf.libraryPath, "later.md"), "changed meanwhile\n");
            return target.get(id);
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const finder = createOriginFinder(world.ctx, { store, git: world.install.git });
    const error = await rejection(finder.attach(pdf.id, candidate));
    expect(error.code).toBe("CHANGED_ON_DISK");
    expect(world.store.get(pdf.id).sourceType).toBe("import");
  });

  it("follows a marketplace listing of the same name through the marketplace", async () => {
    const pdf = importedPdf();
    const listing: MarketListing = {
      cachedAt: null,
      skills: [
        {
          provider: "skills_sh",
          id: `${MARKET_SOURCE}/pdf`,
          skillId: "pdf",
          name: "pdf",
          source: MARKET_SOURCE,
          installs: 10,
          summary: null,
          version: null,
          installed: false,
        },
      ],
    };
    const finder = createOriginFinder(world.ctx, {
      store: world.store,
      git: world.install.git,
      searchMarket: async () => listing,
    });
    const search = await finder.find(pdf.id);
    const [found] = search.candidates;
    expect(found).toMatchObject({
      evidence: "marketplace",
      marketRef: `${MARKET_SOURCE}/pdf`,
      match: "identical",
    });
    const linked = await finder.attach(pdf.id, found!);
    expect(linked).toMatchObject({
      sourceType: "marketplace",
      sourceRef: `${MARKET_SOURCE}/pdf`,
      updateStatus: "up_to_date",
    });
    expect((await world.updates.api.check(pdf.id, true)).updateStatus).toBe("up_to_date");
  });

  it("keeps searching when the marketplace cannot be reached", async () => {
    const pdf = importedPdf();
    const finder = createOriginFinder(world.ctx, {
      store: world.store,
      git: world.install.git,
      searchMarket: async () => {
        throw new Error("offline");
      },
    });
    const search = await finder.find(pdf.id);
    expect(search.candidates).toEqual([]);
    expect(search.failures).toEqual(["Marketplace: offline"]);
  });
});

describe("link by itself after an import", () => {
  /** A checkout of the fixture repository, as someone cloned it by hand. */
  function clonedByHand(): string {
    const clone = join(world.home, "code", "skills");
    mkdirSync(join(world.home, "code"), { recursive: true });
    git(join(world.home, "code"), "clone", "--quiet", `${REPO_URL}.git`, "skills");
    return join(clone, "skills", "pdf");
  }

  it("links an import whose folder is a checkout holding the same files", async () => {
    const folder = clonedByHand();
    const pdf = importedPdf({ sourceRef: folder });
    const linked = await world.updates.origin.linkIfExact(pdf.id, folder);
    expect(linked).toMatchObject({
      sourceType: "git",
      sourceSubpath: "skills/pdf",
      sourceBranch: "main",
      updateStatus: "up_to_date",
    });
  });

  it("leaves an import alone when its files differ from the checkout", async () => {
    const folder = clonedByHand();
    const pdf = importedPdf({ sourceRef: folder });
    writeFile(join(pdf.libraryPath, "extra.md"), "mine\n");
    world.rehash(pdf);
    expect(await world.updates.origin.linkIfExact(pdf.id, folder)).toBeNull();
    expect(world.store.get(pdf.id).sourceType).toBe("import");
  });

  it("follows no links from SKILL.md on its own: those are for Find source", async () => {
    // The document links its repository, which holds the very same files.
    const pdf = importedPdf({ body: `${upstreamDocument()}\nFrom ${REPO_URL}\n` });
    writeFile(pdfInRemote("SKILL.md"), `${upstreamDocument()}\nFrom ${REPO_URL}\n`);
    commitAll(world.remote, "pdf: link home");
    let fetched = 0;
    const counting = world.withGit({
      checkout: (...args) => {
        fetched += 1;
        return world.install.git.checkout(...args);
      },
    });
    expect(await counting.origin.linkIfExact(pdf.id, join(world.home, "elsewhere"))).toBeNull();
    expect(fetched).toBe(0);
  });

  it("looks for one imported skill at a time", async () => {
    const folder = clonedByHand();
    const pdf = importedPdf({ sourceRef: folder });
    let running = 0;
    let most = 0;
    const counting = world.withGit({
      checkout: async (...args) => {
        running += 1;
        most = Math.max(most, running);
        try {
          return await world.install.git.checkout(...args);
        } finally {
          running -= 1;
        }
      },
    });
    await Promise.all([1, 2, 3].map(() => counting.origin.linkIfExact(pdf.id, folder)));
    expect(most).toBe(1);
    expect(world.store.get(pdf.id).sourceType).toBe("git");
  });

  it("leaves a skill marked as the user's own alone", async () => {
    const folder = clonedByHand();
    const pdf = importedPdf({ sourceRef: folder });
    world.store.update(pdf.id, { authored: true });
    expect(await world.updates.origin.linkIfExact(pdf.id, folder)).toBeNull();
    expect(world.store.get(pdf.id).sourceType).toBe("import");
  });
});
