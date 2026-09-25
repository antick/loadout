import { describe, expect, it } from "vitest";
import { agentKeyFor, parseSkillsCommand } from "../src/install/skills-command";

describe("parseSkillsCommand", () => {
  it("reads the command skill pages show", () => {
    expect(
      parseSkillsCommand(
        "npx skills add https://github.com/vercel-labs/skills --skill find-skills",
      ),
    ).toEqual({
      source: "https://github.com/vercel-labs/skills",
      skills: ["find-skills"],
      agents: [],
      allSkills: false,
      allAgents: false,
    });
  });

  it("takes several values per flag, quotes, other runners and aliases of add", () => {
    expect(
      parseSkillsCommand(
        `bunx skills i acme/skills -s pdf "Convex Best Practices" -a claude-code codex -g -y`,
      ),
    ).toMatchObject({
      source: "acme/skills",
      skills: ["pdf", "Convex Best Practices"],
      agents: ["claude-code", "codex"],
    });
    expect(parseSkillsCommand("pnpm dlx skills install acme/skills")?.source).toBe("acme/skills");
    expect(parseSkillsCommand("skills add acme/skills --agent cursor")?.agents).toEqual(["cursor"]);
    expect(parseSkillsCommand("npx -y skills@latest add acme/skills")?.source).toBe("acme/skills");
  });

  it("understands wildcards and --all", () => {
    expect(parseSkillsCommand("npx skills add acme/skills --skill '*' -a '*'")).toMatchObject({
      skills: [],
      agents: [],
      allSkills: true,
      allAgents: true,
    });
    expect(parseSkillsCommand("npx skills add acme/skills --all")).toMatchObject({
      allSkills: true,
      allAgents: true,
    });
  });

  it("returns null for anything that is not an install command", () => {
    for (const text of [
      "acme/skills",
      "npx skills list",
      "npx skills add",
      "npx skills add --all",
      "npm install skills",
    ]) {
      expect(parseSkillsCommand(text)).toBeNull();
    }
  });
});

describe("agentKeyFor", () => {
  const known = new Set(["claude_code", "kilo_code", "cursor", "my-agent"]);

  it("maps the skills CLI spelling to agent keys, and says when there is none", () => {
    expect(agentKeyFor("claude-code", known)).toBe("claude_code");
    expect(agentKeyFor("Cursor", known)).toBe("cursor");
    expect(agentKeyFor("kilo", known)).toBe("kilo_code");
    expect(agentKeyFor("my-agent", known)).toBe("my-agent");
    expect(agentKeyFor("zed", known)).toBeNull();
  });
});
