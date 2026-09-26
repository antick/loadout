import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import {
  marketSourceToUrl,
  normalizeRepoUrl,
  parseGitSource,
  redactUrl,
  repoNameFromUrl,
  resolveTreeRef,
  validateGitInput,
} from "../src/install/git-source";

const NONE = { branch: null, subpath: null, treeTail: null, skill: null };

function expectInvalid(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("INVALID_INPUT");
    return;
  }
  throw new Error("expected INVALID_INPUT");
}

describe("parseGitSource", () => {
  it("expands owner/repo shorthand to a GitHub clone URL", () => {
    expect(parseGitSource("acme/skills")).toEqual({
      cloneUrl: "https://github.com/acme/skills.git",
      ...NONE,
    });
    expect(parseGitSource("  acme/skills.git ").cloneUrl).toBe(
      "https://github.com/acme/skills.git",
    );
  });

  it("leaves full URLs unchanged, ssh:// included", () => {
    for (const url of [
      "https://gitlab.com/acme/skills.git",
      "https://example.com/acme/skills",
      "http://git.internal/acme/skills.git",
      "ssh://git@github.com/acme/skills.git",
      "SSH://git@host:2222/acme/skills.git",
      "git@github.com:acme/skills.git",
    ]) {
      expect(parseGitSource(url)).toEqual({ cloneUrl: url, ...NONE });
    }
  });

  it("reads GitHub tree URLs", () => {
    expect(parseGitSource("https://github.com/acme/skills/tree/main")).toEqual({
      cloneUrl: "https://github.com/acme/skills.git",
      branch: "main",
      subpath: null,
      treeTail: null,
      skill: null,
    });
    expect(parseGitSource("https://github.com/acme/skills.git/tree/main/skills/pdf/")).toEqual({
      cloneUrl: "https://github.com/acme/skills.git",
      branch: "main",
      subpath: "skills/pdf",
      treeTail: "main/skills/pdf",
      skill: null,
    });
    // Only /tree/ and a link to a SKILL.md: any other GitHub page is an ordinary URL.
    expect(parseGitSource("https://github.com/acme/skills/blob/main/x").branch).toBeNull();
    expect(parseGitSource("https://gitlab.com/acme/skills/tree/main/x").branch).toBeNull();
  });

  it("reads a link to a SKILL.md on GitHub as the folder around it", () => {
    expect(
      parseGitSource("https://github.com/acme/skills/blob/main/skills/pdf/SKILL.md"),
    ).toMatchObject({
      cloneUrl: "https://github.com/acme/skills.git",
      branch: "main",
      treeTail: "main/skills/pdf",
    });
  });

  it("reads GitLab tree URLs, self-hosted and nested groups included", () => {
    expect(
      parseGitSource("https://gitlab.com/group/sub/skills/-/tree/main/skills/pdf"),
    ).toMatchObject({
      cloneUrl: "https://gitlab.com/group/sub/skills.git",
      branch: "main",
      subpath: "skills/pdf",
      treeTail: "main/skills/pdf",
    });
    expect(parseGitSource("https://git.acme.dev/team/skills/-/tree/dev")).toMatchObject({
      cloneUrl: "https://git.acme.dev/team/skills.git",
      branch: "dev",
      subpath: null,
    });
  });

  it("reads github: and gitlab: prefixes", () => {
    expect(parseGitSource("github:acme/skills")).toEqual({
      cloneUrl: "https://github.com/acme/skills.git",
      ...NONE,
    });
    expect(parseGitSource("github:acme/skills/tools@pdf")).toMatchObject({
      subpath: "tools",
      skill: "pdf",
    });
    expect(parseGitSource("gitlab:group/sub/skills")).toEqual({
      cloneUrl: "https://gitlab.com/group/sub/skills.git",
      ...NONE,
    });
  });

  it("reads a path inside the repository and a skill name after @", () => {
    expect(parseGitSource("acme/skills/skills/pdf")).toEqual({
      cloneUrl: "https://github.com/acme/skills.git",
      ...NONE,
      subpath: "skills/pdf",
    });
    expect(parseGitSource("acme/skills@pdf")).toEqual({
      cloneUrl: "https://github.com/acme/skills.git",
      ...NONE,
      skill: "pdf",
    });
    // An @ in the host part of an address is not a skill name.
    expect(parseGitSource("git@github.com:acme/skills.git").skill).toBeNull();
    expect(parseGitSource("ssh://git@github.com/acme/skills.git").skill).toBeNull();
  });

  it("reads a branch or tag after #, with an optional skill", () => {
    expect(parseGitSource("acme/skills#dev")).toEqual({
      cloneUrl: "https://github.com/acme/skills.git",
      ...NONE,
      branch: "dev",
    });
    expect(parseGitSource("acme/skills#v1.2@pdf")).toMatchObject({ branch: "v1.2", skill: "pdf" });
    expect(parseGitSource("https://gitlab.com/acme/skills.git#main@pdf")).toMatchObject({
      cloneUrl: "https://gitlab.com/acme/skills.git",
      branch: "main",
      skill: "pdf",
    });
    expect(parseGitSource("git@github.com:acme/skills.git#release/2")).toMatchObject({
      cloneUrl: "git@github.com:acme/skills.git",
      branch: "release/2",
    });
  });

  it("reads a marketplace skill page as its repository and skill", () => {
    expect(parseGitSource("https://skills.sh/vercel-labs/skills/find-skills")).toEqual({
      cloneUrl: "https://github.com/vercel-labs/skills.git",
      ...NONE,
      skill: "find-skills",
    });
    // Site pages are not owners.
    expect(parseGitSource("https://skills.sh/topic/react/x").skill).toBeNull();
  });

  it("refuses a path that climbs out of the repository", () => {
    expectInvalid(() => parseGitSource("acme/skills/../../etc"));
    expectInvalid(() => parseGitSource("https://github.com/acme/skills/tree/main/../x"));
  });

  it("rejects everything else", () => {
    for (const input of [
      "",
      "   ",
      "ftp://example.com/repo.git",
      "file:///tmp/repo",
      "ext::sh -c evil",
      "/absolute/path",
      "./relative/path",
      "../up/path",
      "~/home/path",
      "C:\\repos\\skills",
      "C:/repos/skills",
      "justaword",
      "owner/repo with space",
      "github:justaword",
      "gitlab:",
      "--upload-pack=evil",
      "-o/x",
    ]) {
      expectInvalid(() => parseGitSource(input));
      expectInvalid(() => validateGitInput(input));
    }
  });

  it("accepts a local path only through the internal option", () => {
    expectInvalid(() => parseGitSource("/tmp/fixture"));
    expect(parseGitSource("/tmp/fixture", { allowLocalPath: true }).cloneUrl).toBe("/tmp/fixture");
    expect(validateGitInput("file:///tmp/fixture", { allowLocalPath: true })).toBe(
      "file:///tmp/fixture",
    );
  });
});

const failing = async (): Promise<never> => {
  throw new Error("offline");
};
const cancelling = async (): Promise<never> => {
  throw new AppError("CANCELLED", "Operation cancelled");
};

describe("resolveTreeRef", () => {
  const refs = {
    branches: ["main", "feature", "feature/pdf", "release/1.0"],
    tags: ["v1", "feature/pdf/tools"],
  };
  const listRefs = async (): Promise<typeof refs> => refs;

  it("takes the longest branch that is a /-bounded prefix", async () => {
    expect(await resolveTreeRef("u", "feature/pdf/skills/a", listRefs)).toEqual({
      branch: "feature/pdf",
      subpath: "skills/a",
    });
    // "feature/pdfx" must not match the branch "feature/pdf".
    expect(await resolveTreeRef("u", "feature/pdfx/a", listRefs)).toEqual({
      branch: "feature",
      subpath: "pdfx/a",
    });
    expect(await resolveTreeRef("u", "release/1.0", listRefs)).toEqual({
      branch: "release/1.0",
      subpath: null,
    });
  });

  it("prefers any branch over a longer tag, then falls back to tags", async () => {
    expect((await resolveTreeRef("u", "feature/pdf/tools/x", listRefs)).branch).toBe("feature/pdf");
    expect(await resolveTreeRef("u", "v1/skills/a", listRefs)).toEqual({
      branch: "v1",
      subpath: "skills/a",
    });
  });

  it("falls back to the first segment when nothing matches or listing fails", async () => {
    expect(await resolveTreeRef("u", "unknown/skills/a", listRefs)).toEqual({
      branch: "unknown",
      subpath: "skills/a",
    });
    expect(await resolveTreeRef("u", "main/skills", failing)).toEqual({
      branch: "main",
      subpath: "skills",
    });
  });

  it("lets a cancellation through", async () => {
    await expect(resolveTreeRef("u", "main/skills", cancelling)).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });
});

describe("url helpers", () => {
  it("maps a marketplace source to its clone URL", () => {
    expect(marketSourceToUrl("acme/skills")).toBe("https://github.com/acme/skills.git");
    expectInvalid(() => marketSourceToUrl("acme"));
    expectInvalid(() => marketSourceToUrl("https://github.com/acme/skills"));
    expectInvalid(() => marketSourceToUrl("../acme/skills"));
  });

  it("normalises a URL for the cache key", () => {
    expect(normalizeRepoUrl(" https://github.com/acme/skills.git/ ")).toBe(
      "https://github.com/acme/skills",
    );
    expect(normalizeRepoUrl("https://github.com/acme/skills")).toBe(
      normalizeRepoUrl("https://github.com/acme/skills.git"),
    );
    expect(repoNameFromUrl("git@github.com:acme/skills.git")).toBe("skills");
    expect(repoNameFromUrl("git@host:skills.git")).toBe("skills");
  });

  it("hides credentials", () => {
    expect(redactUrl("https://user:token@github.com/acme/skills.git")).toBe(
      "https://github.com/acme/skills.git",
    );
    expect(redactUrl("git@github.com:acme/skills.git")).toBe("git@github.com:acme/skills.git");
    expect(
      redactUrl("fatal: could not read https://ghp_x@github.com/a/b and https://u:p@h/c"),
    ).toBe("fatal: could not read https://github.com/a/b and https://h/c");
  });

  it("refuses a user name, password or token in an http address", () => {
    for (const input of [
      "https://user:token@github.com/acme/skills.git",
      "https://ghp_abc@github.com/acme/skills",
      "http://u@example.com/r.git",
    ]) {
      expectInvalid(() => validateGitInput(input));
    }
    expect(validateGitInput("ssh://git@github.com/acme/skills.git")).toBe(
      "ssh://git@github.com/acme/skills.git",
    );
  });
});
