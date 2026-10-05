/**
 * The preview's seed, as data: the repositories on the "web", the folders in the fake home, and
 * what the library holds once `seed.ts` has put it there through the real API.
 */
import {
  API_DESIGN,
  API_DOCS,
  CODE_REVIEW,
  CODE_REVIEW_NEXT,
  COMMIT_MESSAGES,
  DIFF_REVIEW,
  type Files,
  LOG_TRIAGE,
  PR_SUMMARY,
  REACT_PATTERNS,
  REACT_PATTERNS_CLUTTER,
  REACT_PATTERNS_PUBLISHED,
  RELEASE_NOTES,
  SQL_MIGRATIONS,
  TERRAFORM_REVIEW,
  TEST_FIRST,
  TEST_FIRST_PUBLISHED,
} from "./fixtures-skills.ts";
import { under } from "./files.ts";

/** A skills repository with a history: installed from at `first`, then gaining `next`. */
export const ACME_SKILLS = {
  url: "https://example.com/acme/skills",
  first: {
    ...under("skills/code-review", CODE_REVIEW),
    ...under("skills/sql-migrations", SQL_MIGRATIONS),
    ...under("skills/api-design", API_DESIGN),
    ...under("skills/docs/release-notes", RELEASE_NOTES),
  },
  next: {
    ...under("skills/code-review", CODE_REVIEW_NEXT),
    ...under("skills/log-triage", LOG_TRIAGE),
    ...under("skills/terraform-review", TERRAFORM_REVIEW),
  },
  installed: ["code-review", "sql-migrations"],
};

/** A repository that later drops the skill the library took from it. */
export const AGENT_SKILLS = {
  url: "https://github.com/acme/agent-skills",
  first: under("skills/pr-summary", PR_SUMMARY),
  next: { "skills/pr-summary": null },
};

/** Listed on skills.sh as `acme/frontend`. */
export const FRONTEND = {
  url: "https://github.com/acme/frontend",
  source: "acme/frontend",
  files: under("skills/react-patterns", { ...REACT_PATTERNS, ...REACT_PATTERNS_CLUTTER }),
  skill: "react-patterns",
};

/** Where the library publishes to: it holds older versions of two skills already. */
export const PUBLISH_TARGET = {
  url: "https://github.com/acme/skills",
  files: {
    "README.md": "# Acme skills\n",
    ...under("skills/react-patterns", REACT_PATTERNS_PUBLISHED),
    ...under("skills/test-first", TEST_FIRST_PUBLISHED),
  },
};

/** The backup remote: a bare repository on this computer, under the world's `remotes`. */
export const BACKUP_REPOSITORY = "backup.git";
export const DEVICE_NAME = "This Mac";
export const OTHER_DEVICE_NAME = "Work Laptop";
export const BACKUP_IGNORE = ["outputs/"];

/** Skills only the backup scenarios add (name → description), before both devices share them. */
export const SCENARIO_SKILLS: Record<string, string> = {
  "old-notes": "Notes from an old project, kept for reference.",
  "sql-helper": "Explain a slow query and suggest an index.",
  "pdf-tools": "Split, merge and rotate PDF files.",
  "test-writer": "Write unit tests for a function from its signature.",
  "csv-tools": "Clean, join and summarise CSV files.",
  "docx-tools": "Read and fill Word documents.",
  "image-crop": "Crop and resize images for the web.",
  "commit-helper": "Split a large change into small commits.",
};
/** What the other device deletes in the scenario of many deletions. */
export const MANY_DELETED = [
  "pdf-tools",
  "test-writer",
  "sql-helper",
  "csv-tools",
  "docx-tools",
  "image-crop",
];
/** Both devices change these between syncs: they come back as conflicts. */
export const CONFLICTING = ["release-notes", "sql-helper"];
/** The deployment the repair scenario breaks: a folder Loadout did not make sits in its place. */
export const BROKEN_DEPLOYMENT = { skill: "release-notes", agent: "cursor", dir: ".cursor/skills" };
/** The ClawHub token the publishing scenario saves; the fixtures accept any but one. */
export const CLAWHUB_TOKEN = "clh_good_one";

/** Skill folders on this computer, imported as they are (under `~/Downloads/skills`). */
export const LOCAL_SKILLS: Record<string, Files> = {
  "api-docs": API_DOCS,
  "release-notes": RELEASE_NOTES,
  "test-first": TEST_FIRST,
  "diff-review": DIFF_REVIEW,
  "commit-messages": COMMIT_MESSAGES,
};
/** Skills written here rather than taken from anywhere. */
export const AUTHORED = ["commit-messages"];
export const LOCAL_SKILLS_DIR = ["Downloads", "skills"];

/** Agents' folders in the fake home: their presence is what makes an agent "installed". */
export const AGENT_FOLDERS = [".claude", ".cursor", ".codex", ".config/opencode"];
/** Where Claude Code keeps its own skills (see `CLAUDE_OWN_SKILLS`). */
export const CLAUDE_SKILLS_DIR = ".claude/skills";
export const CUSTOM_AGENT = { displayName: "Desk Helper", skillsDir: ".deskhelper/skills" };

export const TAGS: Record<string, string[]> = {
  "code-review": ["review", "quality"],
  "sql-migrations": ["backend", "quality"],
  "api-docs": ["backend"],
  "react-patterns": ["frontend"],
  "commit-messages": ["git"],
  "diff-review": ["review"],
};
export const NOTES: Record<string, string> = {
  "sql-migrations":
    "Run before every release. It forgets the down migration when a table is renamed.",
};
export const FAVORITES = ["code-review"];

/** Skill → agents it is deployed to. */
export const DEPLOYMENTS: Record<string, string[]> = {
  "code-review": ["claude_code", "cursor", "codex"],
  "commit-messages": ["claude_code"],
  "react-patterns": ["cursor"],
  "api-docs": ["claude_code", "opencode"],
  "test-first": ["claude_code", "cursor", "codex", "opencode"],
  "diff-review": ["claude_code"],
};

export const PRESETS = [
  {
    name: "Frontend work",
    description: "UI projects",
    icon: "brush",
    skills: ["react-patterns", "code-review", "test-first"],
  },
  { name: "Backend work", icon: "database", skills: ["sql-migrations", "api-docs"] },
  { name: "Everyday", icon: "sparkles", skills: ["commit-messages", "test-first"] },
];

/** Projects under `~/code`, with the files that say what they are built with. */
export const PROJECTS: {
  name: string;
  files: Record<string, string>;
  pinned?: boolean;
  opens?: number;
  /** Library skills copied into the project, for these agents. */
  skills?: Record<string, string[]>;
}[] = [
  {
    name: "shop-web",
    files: {
      "package.json": '{ "name": "shop-web", "dependencies": { "react": "19.2.0" } }\n',
      "src/App.tsx": "export function App() {\n  return null;\n}\n",
      "db/migrations/001_init.sql": "create table orders (id serial primary key);\n",
      // Copied in by hand from the skills repository a while ago: one per agent folder.
      ...under(".claude/skills/code-review", CODE_REVIEW),
      ...under(".cursor/skills/sql-migrations", SQL_MIGRATIONS),
    },
    pinned: true,
  },
  {
    name: "billing-api",
    files: { "go.mod": "module example.com/billing-api\n\ngo 1.24\n" },
    opens: 4,
    skills: { "code-review": ["claude_code"] },
  },
  { name: "docs-site", files: { "package.json": '{ "name": "docs-site" }\n' }, opens: 9 },
  { name: "mobile-app", files: { "package.json": '{ "name": "mobile-app" }\n' }, opens: 6 },
  { name: "infra", files: { "main.tf": 'terraform {\n  required_version = ">= 1.9"\n}\n' } },
  { name: "design-system", files: { "package.json": '{ "name": "design-system" }\n' } },
];
/** A linked workspace whose folder is gone, to show how a missing project looks. */
export const MISSING_PROJECT = "legacy-tools";
export const PROJECTS_DIR = "code";

/** A project skill in two agent folders, each copy edited its own way. */
export const DIFFERING_PROJECT_COPIES = {
  project: "billing-api",
  skill: "code-review",
  agent: "cursor",
  dirs: [".claude/skills", ".cursor/skills"],
};

/** A project's `skills.toml` someone broke by hand: a table header left open. */
export const BROKEN_SKILLS_FILE = {
  project: "shop-web",
  text: 'agents = ["claude_code"]\n[[sources\n',
};
