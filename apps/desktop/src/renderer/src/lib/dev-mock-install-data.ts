/** DEV ONLY. The repositories, sites and scans the install mock (`dev-mock-install.ts`) serves. */
import type { DiscoveredSkill, GitPreview } from "@loadout/shared";
import { HOME } from "@/lib/dev-mock-data";

export const DISCOVERED: Omit<DiscoveredSkill, "imported">[] = [
  {
    name: "changelog-writer",
    description: "Turn merged pull requests into a tidy changelog entry.",
    fingerprint: "fp-changelog",
    locations: [
      { agentKey: "claude_code", path: `${HOME}/.claude/skills/changelog-writer` },
      { agentKey: "cursor", path: `${HOME}/.cursor/skills/changelog-writer` },
      { agentKey: "codex", path: `${HOME}/.codex/skills/changelog-writer` },
      { agentKey: "opencode", path: `${HOME}/.config/opencode/skills/changelog-writer` },
    ],
  },
  {
    name: "db-migrations",
    description: "Plan and review schema migrations with a rollback for each step.",
    fingerprint: "fp-migrations",
    locations: [{ agentKey: "codex", path: `${HOME}/.codex/skills/db-migrations` }],
  },
  {
    // Same name, different files: shows how versions are told apart.
    name: "db-migrations",
    description: "Cursor's own take on migrations, with a checklist per table.",
    fingerprint: "fp-migrations-cursor",
    locations: [{ agentKey: "cursor", path: `${HOME}/.cursor/skills/db-migrations` }],
  },
  {
    name: "standup-notes",
    description: null,
    fingerprint: "fp-standup",
    locations: [{ agentKey: "desk_helper", path: `${HOME}/.deskhelper/skills/standup-notes` }],
  },
  {
    name: "broken-frontmatter",
    description: "A skill whose SKILL.md cannot be parsed, to show a failed import.",
    fingerprint: "fp-broken",
    locations: [{ agentKey: "cursor", path: `${HOME}/.cursor/skills/broken-frontmatter` }],
  },
  {
    name: "commit-messages",
    description: "Write conventional commit messages from staged changes.",
    fingerprint: "commit-messages",
    locations: [{ agentKey: "claude_code", path: `${HOME}/.claude/skills/commit-messages` }],
  },
];

export const REPO_SKILLS = [
  { relPath: "skills/api-design", name: "api-design", description: "Design REST and RPC APIs." },
  {
    relPath: "skills/code-review",
    name: "code-review",
    description: "Review a diff for correctness, security and style before it merges.",
  },
  { relPath: "skills/log-triage", name: "log-triage", description: null },
  {
    relPath: "experimental/terraform-review",
    name: "terraform-review",
    description: "Check a Terraform plan for risky changes before it is applied.",
  },
  {
    relPath: "docs/release-notes",
    name: "release-notes",
    description: "Draft release notes from the merged pull requests of a milestone.",
  },
] as const;

/** `owner/repo@skill` or `…#main@skill` → the skill to tick, as the real parser reads it. */
export function namedSkill(text: string): string | null {
  const at = text.lastIndexOf("@");
  return at > text.lastIndexOf("/") && at > text.indexOf(":") ? text.slice(at + 1) || null : null;
}

/** What the real backend reports for a named skill: which rows to tick, which names are absent. */
export function requested(
  skills: GitPreview["skills"],
  name: string | null,
): Pick<GitPreview, "selected" | "missing"> {
  if (!name) return { selected: null, missing: [] };
  const matches = skills.filter((entry) => entry.name === name).map((entry) => entry.relPath);
  return { selected: matches, missing: matches.length > 0 ? [] : [name] };
}

export const MOVED_TO_HOST = "files.elsewhere.net";
/** Agent ids the mock knows, as a pasted command spells them. */
const MOCK_AGENT_IDS: Readonly<Record<string, string>> = {
  "claude-code": "claude_code",
  cursor: "cursor",
  codex: "codex",
  opencode: "opencode",
};

/** A pasted `skills add` command, read roughly: flags with values, `*` for every one. */
export function mockCommand(
  text: string,
): Pick<GitPreview, "agents" | "unknownAgents" | "allAgents"> & { skills: string[] } {
  const tokens = text.trim().split(/\s+/);
  const result = { skills: [] as string[], agents: [] as string[], unknownAgents: [] as string[] };
  let allAgents = tokens.includes("--all");
  let flag: "skill" | "agent" | null = null;
  for (const token of tokens) {
    if (token === "-s" || token === "--skill") flag = "skill";
    else if (token === "-a" || token === "--agent") flag = "agent";
    else if (token.startsWith("-")) flag = null;
    else if (flag === "skill") result.skills.push(token);
    else if (flag === "agent" && token.replaceAll("'", "") === "*") allAgents = true;
    else if (flag === "agent") {
      const key = MOCK_AGENT_IDS[token];
      if (key) result.agents.push(key);
      else result.unknownAgents.push(token);
    }
  }
  return { ...result, allAgents };
}

/** Folders and skills per folder of the mock "big" repository, to try search and collapsed groups. */
const BIG_REPO_FOLDERS = ["frontend", "backend", "data", "ops"] as const;
const BIG_REPO_SKILLS_PER_FOLDER = 9;

/** A repository with many skills in several folders. */
export function bigRepoSkills(): { relPath: string; name: string; description: string }[] {
  return BIG_REPO_FOLDERS.flatMap((folder) =>
    Array.from({ length: BIG_REPO_SKILLS_PER_FOLDER }, (_, index) => ({
      relPath: `skills/${folder}/${folder}-tool-${index + 1}`,
      name: `${folder}-tool-${index + 1}`,
      description: `Helper ${index + 1} for ${folder} work.`,
    })),
  );
}

export const SITE_SKILLS = [
  { relPath: "orders", name: "orders", description: "Look up and refund orders." },
  { relPath: "catalog", name: "catalog", description: "Search the product catalog." },
  { relPath: "support", name: "support", description: "Answer support tickets in house style." },
] as const;
