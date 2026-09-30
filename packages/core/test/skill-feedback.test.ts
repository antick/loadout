import {
  FEEDBACK_HAPPENED_MAX,
  FEEDBACK_PROPOSAL_MAX,
  FEEDBACK_TITLE_MAX,
  FEEDBACK_URL_MAX,
  buildSkillFeedback,
  canReportSkill,
  feedbackInputProblem,
  feedbackTarget,
  feedbackTitle,
} from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { skillRecord } from "./skill-records";

const fromGit = (url: string, extra = {}) =>
  skillRecord("code-review", {
    sourceType: "git",
    sourceUrl: url,
    sourceRevision: "0123456789abcdef0123",
    sourceBranch: "main",
    sourceSubpath: "skills/code-review",
    libraryPath: "/Users/someone/.loadout/skills/code-review",
    ...extra,
  });

describe("skill feedback: where a report goes", () => {
  it("is possible for skills from a repository, and only those", () => {
    expect(canReportSkill(fromGit("https://github.com/acme/skills"))).toBe(true);
    expect(
      canReportSkill(
        skillRecord("a", { sourceType: "marketplace", sourceUrl: "https://github.com/a/b" }),
      ),
    ).toBe(true);
    expect(canReportSkill(skillRecord("a"))).toBe(false);
    expect(
      canReportSkill(skillRecord("a", { sourceType: "url", sourceUrl: "https://x.test/a.zip" })),
    ).toBe(false);
    expect(canReportSkill(skillRecord("a", { sourceType: "git", sourceUrl: null }))).toBe(false);
  });

  it("finds the tracker on GitHub in any spelling of the address", () => {
    for (const url of [
      "https://github.com/acme/skills",
      "https://github.com/acme/skills.git",
      "https://user:secret@github.com/acme/skills.git",
      "git@github.com:acme/skills.git",
      "ssh://git@github.com/acme/skills",
      "https://GitHub.com/acme/skills/",
    ]) {
      expect(feedbackTarget(fromGit(url))).toEqual({ host: "github", repository: "acme/skills" });
    }
  });

  it("finds a GitLab tracker, including nested groups", () => {
    expect(feedbackTarget(fromGit("https://gitlab.com/acme/team/skills.git"))).toEqual({
      host: "gitlab",
      repository: "acme/team/skills",
    });
  });

  it("has none for other hosts, odd shapes, or names that could bend the link", () => {
    for (const url of [
      "https://git.example.com/acme/skills",
      "https://github.com/acme",
      "https://github.com/acme/skills/extra",
      "https://github.com/../skills",
      "https://github.com/acme/sk ills",
      "https://github.com/acme/skills?x=1",
    ]) {
      expect(feedbackTarget(fromGit(url))).toBeNull();
    }
    expect(feedbackTarget(skillRecord("a"))).toBeNull();
  });
});

describe("skill feedback: the report", () => {
  it("makes a title from the skill and the first line", () => {
    expect(feedbackTitle("code-review", "\n  It skipped the summary.\nMore text")).toBe(
      "code-review: It skipped the summary.",
    );
    expect(feedbackTitle("code-review", "   ")).toBe("code-review");
    const long = feedbackTitle("code-review", "x".repeat(300));
    expect(long).toHaveLength(FEEDBACK_TITLE_MAX);
    expect(long.endsWith("...")).toBe(true);
  });

  it("writes what happened, the proposal when there is one, and the context", () => {
    const draft = buildSkillFeedback(
      fromGit("https://github.com/acme/skills"),
      { happened: "It edited files first.", proposal: "Step 4: print the summary, then stop." },
      { loadoutVersion: "0.1.0" },
    );
    expect(draft.body).toBe(
      [
        "### What happened",
        "",
        "It edited files first.",
        "",
        "### Proposed change to SKILL.md",
        "",
        "Step 4: print the summary, then stop.",
        "",
        "### Context",
        "",
        "- Skill: `code-review`",
        "- Where in the repository: folder `skills/code-review`, branch `main`",
        "- Installed revision: `0123456789`",
        "- Reported from Loadout 0.1.0",
        "",
      ].join("\n"),
    );
  });

  it("leaves the proposal out when there is none, and says when the skill was edited here", () => {
    const draft = buildSkillFeedback(
      fromGit("https://github.com/acme/skills", { editedFiles: ["SKILL.md", "a.md"] }),
      {
        happened: "Wrong output.",
      },
    );
    expect(draft.body).not.toContain("Proposed change");
    expect(draft.body).toContain("- Edited on the reporter's computer: 2 files");
    expect(draft.body).not.toContain("Reported from Loadout");
  });

  it("never puts anything from this computer in the report", () => {
    const draft = buildSkillFeedback(fromGit("https://user:secret@github.com/acme/skills.git"), {
      happened: "Wrong output.",
    });
    for (const text of [draft.title, draft.body, draft.url ?? ""]) {
      expect(text).not.toContain("/Users/someone");
      expect(text).not.toContain("secret");
    }
  });

  it("keeps a value with backticks or line breaks inside its code span", () => {
    const draft = buildSkillFeedback(
      fromGit("https://github.com/acme/skills", { sourceBranch: "a`b\nc" }),
      {
        happened: "x",
      },
    );
    expect(draft.body).toContain("branch `a b c`");
  });
});

describe("skill feedback: the new-issue link", () => {
  const happened = "It printed a & b # c\nsecond line, and é中文 ?x=1";

  it("fills in the GitHub new-issue page, and the text survives the round trip", () => {
    const draft = buildSkillFeedback(fromGit("https://github.com/acme/skills"), { happened });
    const url = new URL(draft.url ?? "");
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/acme/skills/issues/new");
    expect(url.searchParams.get("title")).toBe(draft.title);
    expect(url.searchParams.get("body")).toBe(draft.body);
    expect(draft.urlHasBody).toBe(true);
  });

  it("fills in the GitLab one with its own field names", () => {
    const draft = buildSkillFeedback(fromGit("https://gitlab.com/acme/team/skills"), { happened });
    const url = new URL(draft.url ?? "");
    expect(`${url.origin}${url.pathname}`).toBe("https://gitlab.com/acme/team/skills/-/issues/new");
    expect(url.searchParams.get("issue[title]")).toBe(draft.title);
    expect(url.searchParams.get("issue[description]")).toBe(draft.body);
  });

  it("gives only the text when the host is not one it knows", () => {
    const draft = buildSkillFeedback(fromGit("https://git.example.com/acme/skills"), { happened });
    expect(draft).toMatchObject({ target: null, url: null, urlHasBody: false });
    expect(draft.body).toContain(happened);
  });

  it("falls back to a note and the copied report when the link would be too long", () => {
    const draft = buildSkillFeedback(fromGit("https://github.com/acme/skills"), {
      happened: "\u00e9".repeat(1500),
    });
    expect(draft.urlHasBody).toBe(false);
    expect((draft.url ?? "").length).toBeLessThan(FEEDBACK_URL_MAX);
    expect(new URL(draft.url ?? "").searchParams.get("body")).toContain("Paste it here");
    expect(draft.body).toContain("\u00e9\u00e9\u00e9");
  });
});

describe("skill feedback: what can be sent", () => {
  it("needs something that happened, and stays within the limits", () => {
    expect(feedbackInputProblem({ happened: "  \n " })).toBe("empty");
    expect(feedbackInputProblem({ happened: "It broke." })).toBeNull();
    expect(feedbackInputProblem({ happened: "x".repeat(FEEDBACK_HAPPENED_MAX + 1) })).toBe(
      "happened_too_long",
    );
    expect(
      feedbackInputProblem({ happened: "x", proposal: "y".repeat(FEEDBACK_PROPOSAL_MAX + 1) }),
    ).toBe("proposal_too_long");
    expect(feedbackInputProblem({ happened: "x".repeat(FEEDBACK_HAPPENED_MAX) })).toBeNull();
  });
});
