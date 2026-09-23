import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GIT_NEEDED, createDownload, parseAdvertisement } from "../src/install";
import { type TestWorld, createTestWorld } from "./helpers";
import {
  type InstallHarness,
  createInstallHarness,
  isolateTmpDir,
  leftoverCheckouts,
} from "./install-fixtures";

/** A git executable that does not exist, so every git call fails with GIT_MISSING. */
const NO_GIT = { binary: "loadout-test-no-such-git" };
const MAIN_SHA = "a".repeat(40);
const DEV_SHA = "b".repeat(40);
const TAG_OBJECT_SHA = "c".repeat(40);
const TAG_COMMIT_SHA = "d".repeat(40);
const REFS_URL = "https://github.com/acme/skills.git/info/refs?service=git-upload-pack";

function pkt(line: string): string {
  return (line.length + 4).toString(16).padStart(4, "0") + line;
}

/** What `git-upload-pack` advertises: HEAD with capabilities first, then branches and tags. */
function advertisement(): Buffer {
  return Buffer.from(
    [
      pkt("# service=git-upload-pack\n"),
      "0000",
      pkt(`${MAIN_SHA} HEAD\0multi_ack symref=HEAD:refs/heads/main agent=git/github\n`),
      pkt(`${DEV_SHA} refs/heads/dev\n`),
      pkt(`${MAIN_SHA} refs/heads/main\n`),
      pkt(`${TAG_OBJECT_SHA} refs/tags/v1\n`),
      pkt(`${TAG_COMMIT_SHA} refs/tags/v1^{}\n`),
      "0000",
    ].join(""),
  );
}

function skillMd(name: string): string {
  return `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n`;
}

/** An archive the way codeload serves it: everything inside one `<repo>-<sha>/` folder. */
function repoZip(sha: string, skills: string[]): Buffer {
  const files: Record<string, Uint8Array> = { [`skills-${sha}/README.md`]: strToU8("# repo") };
  for (const name of skills) {
    files[`skills-${sha}/skills/${name}/SKILL.md`] = strToU8(skillMd(name));
  }
  return Buffer.from(zipSync(files));
}

interface FakeWeb {
  fetch: typeof fetch;
  requests: string[];
}

/** Serves fixed bodies by URL; anything else is a 404, like a private or missing repository. */
function fakeWeb(routes: Record<string, Buffer>): FakeWeb {
  const requests: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    requests.push(url);
    const body = routes[url];
    if (!body) return new Response("Not Found", { status: 404 });
    return new Response(body, { status: 200, headers: { "content-length": String(body.length) } });
  }) as typeof fetch;
  return { fetch: fetchImpl, requests };
}

const GITHUB_ROUTES = (): Record<string, Buffer> => ({
  [REFS_URL]: advertisement(),
  [`https://codeload.github.com/acme/skills/zip/${MAIN_SHA}`]: repoZip(MAIN_SHA, ["pdf", "docx"]),
  [`https://codeload.github.com/acme/skills/zip/${DEV_SHA}`]: repoZip(DEV_SHA, ["pdf", "beta"]),
});

let world: TestWorld;
let tmp: string;
let restoreTmp: () => void;
let web: FakeWeb;
let install: InstallHarness;

beforeEach(() => {
  world = createTestWorld();
  tmp = join(world.root, "tmp");
  restoreTmp = isolateTmpDir(tmp);
  web = fakeWeb(GITHUB_ROUTES());
  install = createInstallHarness(world, { git: NO_GIT, fetchImpl: web.fetch });
});

afterEach(() => {
  restoreTmp();
  world.cleanup();
});

describe("ref advertisement", () => {
  it("reads branches, tags and HEAD, skipping the service line and capabilities", () => {
    const refs = parseAdvertisement(advertisement());
    expect(Object.fromEntries(refs)).toEqual({
      HEAD: MAIN_SHA,
      "refs/heads/dev": DEV_SHA,
      "refs/heads/main": MAIN_SHA,
      "refs/tags/v1": TAG_OBJECT_SHA,
      "refs/tags/v1^{}": TAG_COMMIT_SHA,
    });
  });

  it("ignores an empty repository's zero id and a truncated body", () => {
    const empty = Buffer.from(pkt(`${"0".repeat(40)} capabilities^{}\0agent=x\n`) + "0000");
    expect(parseAdvertisement(empty).size).toBe(0);
    expect(parseAdvertisement(Buffer.from("00ffshort")).size).toBe(0);
  });
});

describe("without git", () => {
  it("previews and installs a GitHub repository from its archive", async () => {
    const preview = await install.api.previewGit("acme/skills");
    expect(preview).toMatchObject({
      repoUrl: "https://github.com/acme/skills.git",
      branch: null,
      revision: MAIN_SHA,
    });
    expect(preview.skills.map((skill) => skill.relPath)).toEqual(["docx", "pdf"]);

    const [skill] = await install.api.confirmGit(preview.previewId, [
      { relPath: "pdf", name: "pdf" },
    ]);
    expect(skill).toMatchObject({
      name: "pdf",
      sourceType: "git",
      sourceUrl: "https://github.com/acme/skills.git",
      sourceSubpath: "skills/pdf",
      sourceRevision: MAIN_SHA,
    });
    expect(readFileSync(join(skill?.libraryPath ?? "", "SKILL.md"), "utf8")).toBe(skillMd("pdf"));
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });

  it("follows the branch and subfolder of a tree link", async () => {
    const preview = await install.api.previewGit(
      "https://github.com/acme/skills/tree/dev/skills/beta",
    );
    expect(preview).toMatchObject({ branch: "dev", revision: DEV_SHA });
    expect(preview.skills.map((skill) => skill.name)).toEqual(["beta"]);
    await install.api.cancelPreview(preview.previewId);
  });

  it("installs from the marketplace", async () => {
    const skill = await install.api.fromMarket("acme/skills", "docx");
    expect(skill).toMatchObject({
      name: "docx",
      sourceType: "marketplace",
      sourceRevision: MAIN_SHA,
    });
  });

  it("answers update lookups, preferring a branch over a tag and a peeled tag", async () => {
    const url = "https://github.com/acme/skills.git";
    expect(await install.git.lsRemote(url)).toBe(MAIN_SHA);
    expect(await install.git.lsRemote(url, { branch: "dev" })).toBe(DEV_SHA);
    expect(await install.git.lsRemote(url, { branch: "v1" })).toBe(TAG_COMMIT_SHA);
    expect(await install.git.lsRemote(url, { branch: "gone" })).toBeNull();
    expect(await install.git.listRefs(url)).toEqual({ branches: ["dev", "main"], tags: ["v1"] });
  });

  it("reports download progress as a percentage", async () => {
    const preview = await install.api.previewGit("acme/skills");
    await install.api.cancelPreview(preview.previewId);
    const percents = install.events.flatMap(({ payload }) =>
      "phase" in payload && payload.phase === "cloning" && payload.current !== undefined
        ? [payload.current]
        : [],
    );
    expect(percents.at(-1)).toBe(100);
  });

  it("says a repository is missing or private, naming the repository", async () => {
    const error = await install.api.previewGit("acme/secret").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message:
        "The repository at https://github.com/acme/secret.git was not found, or it is private.",
    });
  });

  it("asks for Git for hosts it cannot download from, and never sends credentials", async () => {
    for (const url of [
      "https://example.com/acme/skills.git",
      "git@github.com:acme/skills.git",
      "https://user:token@github.com/acme/skills.git",
    ]) {
      await expect(install.api.previewGit(url)).rejects.toMatchObject({
        code: "GIT_MISSING",
        message: GIT_NEEDED,
      });
    }
    expect(web.requests.some((url) => url.includes("token"))).toBe(false);
  });
});

describe("with git", () => {
  it("never downloads anything itself", async () => {
    const withGit = createInstallHarness(world, { fetchImpl: web.fetch });
    await expect(withGit.api.previewGit("https://example.invalid/acme/none.git")).rejects.toThrow();
    expect(web.requests).toEqual([]);
  });
});

describe("download", () => {
  it("asks once more when the host is busy building the file", async () => {
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 406 })
        : new Response(Buffer.from("zip"), { status: 200 });
    }) as unknown as typeof fetch;
    const body = await createDownload(flaky)("https://gitlab.com/a/b/-/archive/x/b-x.zip");
    expect(body.toString()).toBe("zip");
    expect(calls).toBe(2);
  });

  it("refuses a body over the limit and hides credentials in messages", async () => {
    const big = (async () =>
      new Response(Buffer.alloc(64), { status: 200 })) as unknown as typeof fetch;
    await expect(
      createDownload(big)("https://example.com/a.zip", { maxBytes: 10 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const failing = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const error = await createDownload(failing)("https://user:secret@example.com/a.zip").catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: "NETWORK" });
    expect(String((error as Error).message)).not.toContain("secret");
  });
});
