/** Skill folders of the preview seed, as data: path inside the folder → file text. */
export type Files = Record<string, string>;

/** A plain YAML value that would read as something else: a mapping, a comment, a list. */
const NEEDS_QUOTES = /: |#|^[[{&*!|>'"%@`-]/;

/** A `SKILL.md` with its frontmatter. A value starting with a line break is a YAML block. */
export function skillDocument(
  name: string,
  description: string,
  body: string,
  extra: Record<string, string> = {},
): string {
  const fields = Object.entries({ name, description, ...extra }).map(
    ([key, value]) =>
      `${key}: ${!value.startsWith("\n") && NEEDS_QUOTES.test(value) ? JSON.stringify(value) : value}`,
  );
  return `---\n${fields.join("\n")}\n---\n\n# ${name}\n\n${body.trim()}\n`;
}

/**
 * Shaped like a GitHub token, so the backup and publish checks hold it back. Built from parts,
 * so no scanner mistakes this file for one holding a real key; none of them says "example",
 * which the checks take for documentation.
 */
export const FAKE_GITHUB_TOKEN = ["ghp", "_", "Q7mV2kLp9Rt4", "Wz8Nc3Hd6Jb1", "Fs5Gy0Ua2Ke7"].join(
  "",
);

const REVIEW_STEPS = `
## Steps

1. Read the whole diff before commenting on any line.
2. Check correctness first: inputs, edge cases, error paths.
3. Look for security problems: injection, secrets, unchecked input.
4. Note style only where it hides a bug or breaks the house style.
5. Sum up in three lines: what changed, what is risky, what to fix.

## Do not

- Rewrite the author's code in the review.
- Block on taste.
`;

export const CODE_REVIEW: Files = {
  "SKILL.md": skillDocument(
    "code-review",
    "Review a diff for correctness, security and style before it merges.",
    REVIEW_STEPS,
  ),
  "examples.md":
    "# Examples\n\n## A good comment\n\n> This loop reads past the end when `items` is empty.\n",
};

/** The source's next revision of code-review: what an update brings in. */
export const CODE_REVIEW_NEXT: Files = {
  ...CODE_REVIEW,
  "examples.md": `${CODE_REVIEW["examples.md"]}\n## A comment to avoid\n\n> I would have written this differently.\n`,
};

export const DIFF_REVIEW: Files = {
  "SKILL.md": skillDocument(
    "diff-review",
    "Review a diff for correctness, security and style before a pull request merges.",
    REVIEW_STEPS,
  ),
};

export const SQL_MIGRATIONS: Files = {
  "SKILL.md": skillDocument(
    "sql-migrations",
    "Plan and write safe, reversible database migrations.",
    `
## Steps

1. Write the up and the down migration together.
2. Run \`scripts/apply.sh\` against a copy of the database first.
3. Keep every migration small enough to roll back on its own.
`,
    { "allowed-tools": "Bash(psql *), Read", model: "sonnet" },
  ),
  "scripts/apply.sh": '#!/bin/sh\nset -e\npsql "$DATABASE_URL" -f "$1"\n',
  "scripts/rollback.sh": '#!/bin/sh\nset -e\npsql "$DATABASE_URL" -f "$1.down.sql"\n',
};

export const API_DESIGN: Files = {
  "SKILL.md": skillDocument(
    "api-design",
    "Shape HTTP APIs: resources, status codes, pagination and errors.",
    "Name resources as nouns, return problem details for errors, page with cursors.",
  ),
};

export const RELEASE_NOTES: Files = {
  "SKILL.md": skillDocument(
    "release-notes",
    "Turn merged pull requests into readable release notes.",
    "Group changes by what users notice: new, changed, fixed. One line each, no ticket numbers.",
  ),
};

export const LOG_TRIAGE: Files = {
  "SKILL.md": skillDocument(
    "log-triage",
    "Find the first error in a long log and the lines that explain it.",
    "Run `scripts/first-error.sh` on the log, then read the twenty lines before what it finds.",
    // A hook in the frontmatter: what an import list can see before anything is fetched in full.
    {
      hooks: [
        "",
        "  PostToolUse:",
        "    - matcher: Bash",
        "      hooks:",
        "        - type: command",
        "          command: ./scripts/first-error.sh",
      ].join("\n"),
    },
  ),
  "scripts/first-error.sh": '#!/bin/sh\ngrep -n -m 1 -i "error" "$1"\n',
};

export const TERRAFORM_REVIEW: Files = {
  "SKILL.md": skillDocument(
    "terraform-review",
    "Check a Terraform plan for deletions, drift and open security groups.",
    "Read the plan, list every destroy and replace, flag 0.0.0.0/0 ingress.",
  ),
};

export const PR_SUMMARY: Files = {
  "SKILL.md": skillDocument(
    "pr-summary",
    "Summarise a pull request for reviewers in five lines.",
    "What changed, why, how it was tested, what to look at, what is left out.",
  ),
};

export const REACT_PATTERNS: Files = {
  "SKILL.md": skillDocument(
    "react-patterns",
    "Component, hook and state patterns for React 19 apps.",
    "Keep state where it is used, derive instead of syncing, use actions for forms.",
  ),
  "notes.md": "# Notes\n\nPrefer `use` for reading promises in components.\n",
};

/** The older react-patterns already in the repository the library publishes to. */
export const REACT_PATTERNS_PUBLISHED: Files = {
  "SKILL.md": skillDocument(
    "react-patterns",
    "Component and hook patterns for React apps.",
    "Keep state where it is used.",
  ),
};

/** Files a skill folder can pick up that publishing leaves out. */
export const REACT_PATTERNS_CLUTTER: Files = {
  "node_modules/left-pad/package.json": '{ "name": "left-pad" }\n',
  ".env": "API_URL=http://localhost:3000\n",
};

export const API_DOCS: Files = {
  "SKILL.md": skillDocument(
    "api-docs",
    "Keep an OpenAPI document in step with the endpoints.",
    "After changing an endpoint, update `openapi.json` in the same commit. See reference.md.",
  ),
};

/** Added to api-docs after the first backup: with a token pasted in, on line 14. */
export const API_DOCS_REFERENCE = {
  path: "reference.md",
  text: [
    "# Reference",
    "",
    "## Checking the document",
    "",
    "Run the linter on `openapi.json` before every commit.",
    "",
    "## Fetching the live schema",
    "",
    "The staging server publishes its schema at `/openapi.json`.",
    "",
    "```sh",
    "curl https://staging.example.com/openapi.json \\",
    "  -H 'Accept: application/json' \\",
    `  -H 'Authorization: Bearer ${FAKE_GITHUB_TOKEN}'`,
    "```",
    "",
  ].join("\n"),
};

export const TEST_FIRST: Files = {
  "SKILL.md": skillDocument(
    "test-first",
    "Red, green, refactor with small steps and fast feedback.",
    "Write one failing test, make it pass with the least code, then tidy up.",
  ),
};

export const TEST_FIRST_PUBLISHED: Files = {
  "SKILL.md": skillDocument("test-first", "Write the test first.", "One failing test at a time."),
};

export const COMMIT_MESSAGES: Files = {
  "SKILL.md": skillDocument(
    "commit-messages",
    "Write conventional commit messages from staged changes.",
    "Read `git diff --staged`, pick the type, write an imperative summary under 72 characters.",
    { "disable-model-invocation": "true" },
  ),
};

/** Skills Claude Code has in its own folder that the library does not manage: name → description. */
export const CLAUDE_OWN_SKILLS: Record<string, string> = {
  "meeting-notes": "Turn a meeting transcript into decisions, owners and dates.",
  "daily-standup": "Draft a standup update from yesterday's commits and today's calendar.",
  "docker-compose": "Write and debug docker-compose files for local development.",
  "regex-helper": "Build, explain and test regular expressions step by step.",
  "pdf-reader": "Pull text, tables and figures out of PDF files.",
};

/** On ClawHub only. */
export const SVELTE_PATTERNS: Files = {
  "SKILL.md": skillDocument(
    "svelte-patterns",
    "Runes, stores and component patterns for Svelte 5.",
    "Use $state for local state, $derived for computed values, snippets for slots.",
  ),
};
