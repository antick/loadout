import { describe, expect, it } from "vitest";
import {
  authEnvironment,
  maskUrlCredentials,
  parseRemoteUrl,
  tokenKey,
} from "../src/backup/credentials";
import { classifyGitError, cleanGitOutput, createGit, gitError } from "../src/backup/git";
import {
  type SkillSide,
  type SkillVersions,
  mergeTags,
  pickSide,
  planMerge,
  planPreset,
  planSkill,
} from "../src/backup/merge-plan";
import { countChangedSkills } from "../src/backup/status";
import { memorySecrets } from "./backup-world";

function side(
  path: string,
  treeHash: string | null,
  tags: string[] = [],
  revision = "r1",
): SkillSide {
  return {
    path,
    treeHash,
    meta: { id: "s1", path, tags, source: { type: "git", revision }, createdAt: 1 },
  };
}

function meta(id: string, path: string, hash: string): SkillSide {
  return {
    path,
    treeHash: hash,
    meta: { id, path, tags: [], source: { type: "local" }, createdAt: 1 },
  };
}

function v(raw: string, updatedAt: number): { raw: string; updatedAt: number } {
  return { raw, updatedAt };
}

describe("merge plan: one value", () => {
  it("lets the side that changed win", () => {
    expect(pickSide("a", "a", "a")).toBe("ours");
    expect(pickSide("a", "a", "b")).toBe("theirs");
    expect(pickSide("a", "b", "a")).toBe("ours");
    expect(pickSide("a", "b", "b")).toBe("ours");
    expect(pickSide("a", "b", "c")).toBe("conflict");
    expect(pickSide(undefined, "b", "c")).toBe("conflict");
    expect(pickSide("a", undefined, "a")).toBe("ours");
  });

  it("merges tags: both additions, both removals", () => {
    expect(mergeTags(["a", "b"], ["a", "b", "c"], ["b", "d"])).toEqual(["b", "c", "d"]);
    expect(mergeTags([], ["x"], ["x"])).toEqual(["x"]);
    expect(mergeTags(["a"], [], ["a"])).toEqual([]);
  });
});

describe("merge plan: one skill", () => {
  const base = side("alpha", "t0");

  it("handles skills present on one side only", () => {
    expect(planSkill("s1", {})).toMatchObject({ outcome: "unchanged", content: "none" });
    expect(planSkill("s1", { ours: base })).toMatchObject({
      outcome: "unchanged",
      content: "ours",
    });
    expect(planSkill("s1", { theirs: base })).toMatchObject({
      outcome: "updated",
      content: "theirs",
      path: "alpha",
    });
  });

  it("takes the remote's edit, keeps ours, accepts equal edits", () => {
    expect(planSkill("s1", { base, ours: base, theirs: side("alpha", "t1") })).toMatchObject({
      outcome: "updated",
      content: "theirs",
    });
    expect(planSkill("s1", { base, ours: side("alpha", "t1"), theirs: base })).toMatchObject({
      outcome: "unchanged",
      content: "ours",
    });
    expect(
      planSkill("s1", { base, ours: side("alpha", "t1"), theirs: side("alpha", "t1") }),
    ).toMatchObject({ outcome: "unchanged", content: "ours" });
  });

  it("flags different edits as a conflict and keeps ours", () => {
    const plan = planSkill("s1", {
      base,
      ours: side("alpha", "t1", [], "r2"),
      theirs: side("alpha", "t2", [], "r3"),
    });
    expect(plan).toMatchObject({ outcome: "conflict", content: "ours", path: "alpha" });
    // Source details follow the content that stays.
    expect(plan.meta?.source.revision).toBe("r2");
    // Two separately created skills with one id and different bytes are a conflict too.
    expect(
      planSkill("s1", { ours: side("alpha", "t1"), theirs: side("alpha", "t2") }).outcome,
    ).toBe("conflict");
  });

  it("combines a rename, an edit and tag changes from different sides", () => {
    const plan = planSkill("s1", {
      base: side("alpha", "t0", ["keep", "drop"]),
      ours: side("alpha", "t1", ["keep", "drop", "mine"], "r2"),
      theirs: side("renamed", "t0", ["keep", "theirs"]),
    });
    expect(plan).toMatchObject({ outcome: "updated", content: "ours", path: "renamed" });
    expect(plan.meta).toMatchObject({
      path: "renamed",
      tags: ["keep", "mine", "theirs"],
      source: { revision: "r2" },
    });
  });

  it("lets our rename win over a different rename", () => {
    const plan = planSkill("s1", {
      base,
      ours: side("mine", "t0"),
      theirs: side("theirs", "t0"),
    });
    expect(plan).toMatchObject({ outcome: "unchanged", path: "mine" });
  });

  it("treats delete against edit as keeping the edit", () => {
    expect(planSkill("s1", { base, ours: base })).toMatchObject({
      outcome: "deleted",
      content: "none",
    });
    expect(planSkill("s1", { base, ours: side("alpha", "t1") })).toMatchObject({
      outcome: "kept_local",
      content: "ours",
    });
    expect(planSkill("s1", { base, theirs: base })).toMatchObject({
      outcome: "unchanged",
      content: "none",
    });
    expect(planSkill("s1", { base, theirs: side("alpha", "t1") })).toMatchObject({
      outcome: "updated",
      content: "theirs",
    });
    // A tag change counts as "still in use" as well.
    expect(planSkill("s1", { base, ours: side("alpha", "t0", ["new"]) }).outcome).toBe(
      "kept_local",
    );
  });

  it("pins a skill with a pending conflict to our side", () => {
    const versions: SkillVersions = { base, ours: base, theirs: side("alpha", "t9") };
    expect(planSkill("s1", versions, false).content).toBe("theirs");
    expect(planSkill("s1", versions, true)).toMatchObject({ outcome: "conflict", content: "ours" });
    // Pending, but the remote did not move: nothing to refresh.
    expect(planSkill("s1", { base, ours: side("alpha", "t1"), theirs: base }, true).outcome).toBe(
      "unchanged",
    );
  });
});

describe("merge plan: whole library", () => {
  it("gives an incoming skill the next free folder, case-insensitively", () => {
    const plan = planMerge({
      skills: new Map([
        ["a-ours", { ours: meta("a-ours", "Notes", "t1") }],
        ["b-theirs", { theirs: meta("b-theirs", "notes", "t2") }],
        ["c-theirs", { theirs: meta("c-theirs", "notes-2", "t3") }],
      ]),
      presets: new Map(),
      residual: new Map(),
      pendingConflicts: new Set(),
    });
    const paths = Object.fromEntries(plan.skills.map((item) => [item.id, item.path]));
    expect(paths["a-ours"]).toBe("Notes");
    expect(new Set(Object.values(paths).map((path) => path?.toLowerCase())).size).toBe(3);
    const moved = plan.skills.find((item) => item.id === "b-theirs");
    expect(moved?.meta?.path).toBe(moved?.path);
  });

  it("keeps our folder when the remote renames a skill onto a name we use", () => {
    const plan = planMerge({
      skills: new Map([
        [
          "one",
          {
            base: meta("one", "one", "t"),
            ours: meta("one", "one", "t"),
            theirs: meta("one", "two", "t"),
          },
        ],
        ["two", { ours: meta("two", "two", "x") }],
      ]),
      presets: new Map(),
      residual: new Map(),
      pendingConflicts: new Set(),
    });
    expect(plan.skills.map((item) => [item.id, item.path])).toEqual([
      ["one", "one"],
      ["two", "two"],
    ]);
  });

  it("decides presets by newest edit and never lets a delete beat an edit", () => {
    expect(planPreset({ base: v("a", 1), ours: v("a", 1), theirs: v("b", 2) })).toBe("theirs");
    expect(planPreset({ base: v("a", 1), ours: v("b", 5), theirs: v("c", 3) })).toBe("ours");
    expect(planPreset({ base: v("a", 1), ours: v("b", 3), theirs: v("c", 5) })).toBe("theirs");
    expect(planPreset({ base: v("a", 1), ours: v("b", 3) })).toBe("ours");
    expect(planPreset({ base: v("a", 1), theirs: v("b", 3) })).toBe("theirs");
    expect(planPreset({ base: v("a", 1), ours: v("a", 1) })).toBe("theirs");
    expect(planPreset({ theirs: v("n", 1) })).toBe("theirs");
  });

  it("merges unclaimed top-level entries as whole units", () => {
    const plan = planMerge({
      skills: new Map(),
      presets: new Map(),
      residual: new Map([
        ["changed-there", { base: "1", ours: "1", theirs: "2" }],
        ["removed-there", { base: "1", ours: "1" }],
        ["changed-here", { base: "1", ours: "2", theirs: "1" }],
        ["both", { base: "1", ours: "2", theirs: "3" }],
        ["new-there", { theirs: "9" }],
      ]),
      pendingConflicts: new Set(),
    });
    expect(plan.residual).toEqual([
      { name: "changed-there", action: "checkout" },
      { name: "new-there", action: "checkout" },
      { name: "removed-there", action: "remove" },
    ]);
  });
});

describe("git error classification", () => {
  const cases: [string, string][] = [
    ["fatal: unable to access 'https://x/': Could not resolve host: x", "NETWORK"],
    ["ssh: connect to host example.com port 22: Connection refused", "NETWORK"],
    ["fatal: unable to access 'https://x/': Failed to connect to x port 443", "NETWORK"],
    [
      "remote: Invalid username or token.\nfatal: Authentication failed for 'https://x/'",
      "GIT_AUTH",
    ],
    ["git@github.com: Permission denied (publickey).", "GIT_AUTH"],
    [
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      "GIT_AUTH",
    ],
    ["fatal: refusing to merge unrelated histories", "GIT_UNRELATED"],
    [
      " ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs",
      "GIT_REJECTED",
    ],
    ["hint: Updates were rejected because the tip is behind (non-fast-forward)", "GIT_REJECTED"],
    ["fatal: The current branch main has no upstream branch.", "GIT_NO_UPSTREAM"],
    ["CONFLICT (content): Merge conflict in alpha/SKILL.md", "SYNC_CONFLICT"],
    ["fatal: not a git repository (or any of the parent directories): .git", "GIT_NOT_REPO"],
    ["fatal: bad object HEAD", "GIT"],
  ];
  it.each(cases)("%s → %s", (stderr, code) => {
    expect(classifyGitError(stderr)).toBe(code);
    expect(gitError(stderr).code).toBe(code);
  });

  it("hides credentials and SSH chatter in what it reports", () => {
    const raw =
      "Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.\nfatal: unable to access 'https://me:hunter2@example.com/r.git/': boom";
    const cleaned = cleanGitOutput(raw);
    expect(cleaned).not.toContain("hunter2");
    expect(cleaned).not.toContain("Permanently added");
    expect(cleaned).toContain("https://***@example.com/r.git/");
    expect(JSON.stringify(gitError(raw).details)).not.toContain("hunter2");
    expect(maskUrlCredentials("ssh://git:pw@host/x")).toBe("ssh://***@host/x");
  });
});

describe("remote URLs", () => {
  it("separates the token from the address", () => {
    expect(parseRemoteUrl("https://user:p%40ss@Host.example:8443/a/b.git")).toEqual({
      kind: "http",
      host: "host.example:8443",
      secure: true,
      cleanUrl: "https://host.example:8443/a/b.git",
      token: "p@ss",
    });
    expect(parseRemoteUrl("https://ghp_token@github.com/o/r.git").token).toBe("ghp_token");
    expect(parseRemoteUrl("http://plain.example/r.git")).toMatchObject({
      secure: false,
      token: null,
    });
  });

  it("accepts ssh, scp-like, shorthand and local remotes", () => {
    expect(parseRemoteUrl("git@github.com:o/r.git")).toMatchObject({
      kind: "ssh",
      host: "github.com",
    });
    expect(parseRemoteUrl("ssh://git@host.example:2222/o/r.git")).toMatchObject({
      kind: "ssh",
      host: "host.example:2222",
    });
    expect(parseRemoteUrl("owner/repo").cleanUrl).toBe("https://github.com/owner/repo.git");
    expect(parseRemoteUrl("/srv/git/skills.git").kind).toBe("local");
  });

  it("rejects what git must never be handed", () => {
    for (const bad of ["", "--upload-pack=evil", "ext::sh -c evil", "ftp://x/y", "just-a-word"]) {
      expect(() => parseRemoteUrl(bad)).toThrow();
    }
  });
});

describe("git credentials", () => {
  it("hands the token to git through the environment, for that https host only", async () => {
    const secrets = memorySecrets();
    await secrets.set(tokenKey("git.example.com"), "tok");
    const env = await authEnvironment(secrets, "https://git.example.com/me/skills.git");
    expect(env).toEqual({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://git.example.com/.extraHeader",
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from("x-access-token:tok").toString("base64")}`,
    });
    // Never over plain http, never to another host, never for ssh.
    expect(await authEnvironment(secrets, "http://git.example.com/me/skills.git")).toEqual({});
    expect(await authEnvironment(secrets, "https://other.example.com/me/skills.git")).toEqual({});
    expect(await authEnvironment(secrets, "git@git.example.com:me/skills.git")).toEqual({});
    expect(await authEnvironment(memorySecrets(false), "https://git.example.com/x.git")).toEqual(
      {},
    );
  });

  it("reports a missing git as GIT_MISSING", async () => {
    const git = createGit({
      repoDir: process.cwd(),
      secrets: memorySecrets(),
      deviceName: () => "Test",
      proxy: () => null,
      remoteUrl: () => null,
    });
    const path = process.env.PATH;
    process.env.PATH = "";
    try {
      expect(await git.available()).toBe(false);
      await expect(git.run(["--version"])).rejects.toMatchObject({ code: "GIT_MISSING" });
    } finally {
      process.env.PATH = path;
    }
    expect(await git.available()).toBe(true);
  });
});

describe("changed skill count", () => {
  it("counts distinct top-level folders, skipping dot entries and old rename paths", () => {
    const porcelain = [
      " M alpha/SKILL.md",
      " M alpha/notes.md",
      "?? beta/",
      "R  gamma-new/SKILL.md",
      "gamma-old/SKILL.md",
      " M .hidden/skills/x.json",
      "?? .gitignore",
      "",
    ].join("\0");
    expect(countChangedSkills(porcelain)).toBe(3);
    expect(countChangedSkills("")).toBe(0);
  });
});
