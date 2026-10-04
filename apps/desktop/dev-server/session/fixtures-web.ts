/** What the preview's web answers with: skills.sh listings, ClawHub and the GitHub account. */
import { CODE_REVIEW, type Files, SVELTE_PATTERNS } from "./fixtures-skills.ts";

/** skills.sh repositories and the skills each lists, most installed first. */
const MARKET_REPOSITORIES: Record<string, string[]> = {
  "acme/agent-skills": [
    "pr-summary",
    "issue-triage",
    "changelog",
    "dependency-audit",
    "flaky-tests",
    "api-mocking",
    "load-testing",
    "feature-flags",
    "error-budgets",
    "incident-notes",
    "runbook-writer",
    "oncall-handover",
    "postmortem",
    "slo-review",
    "trace-reading",
  ],
  "openkit/skills": [
    "css-layout",
    "a11y-audit",
    "seo-meta",
    "image-optimise",
    "form-validation",
    "i18n-strings",
    "dark-mode",
    "web-vitals",
    "service-worker",
    "font-loading",
    "icon-sprites",
    "motion-design",
    "print-styles",
    "email-html",
  ],
  "devtools/skills-pack": [
    "git-bisect",
    "shell-scripts",
    "makefiles",
    "docker-debug",
    "k8s-manifests",
    "ci-cache",
    "release-tags",
    "monorepo-tasks",
    "lint-rules",
    "codemods",
    "env-files",
    "port-conflicts",
    "log-rotation",
    "cron-jobs",
  ],
  "acme/frontend": ["react-patterns", "vue-patterns"],
};

export interface MarketFixture {
  source: string;
  skillId: string;
  name: string;
  installs: number;
}

const TOP_INSTALLS = 48_000;
const INSTALLS_STEP = 900;

export const MARKET_CATALOGUE: MarketFixture[] = Object.entries(MARKET_REPOSITORIES)
  .flatMap(([source, skills]) => skills.map((skillId) => ({ source, skillId })))
  .map(({ source, skillId }, index) => ({
    source,
    skillId,
    name: skillId,
    installs: TOP_INSTALLS - index * INSTALLS_STEP,
  }));

/** A skill published on ClawHub, with the files of its latest version. */
export interface ClawhubFixture {
  owner: string;
  slug: string;
  displayName: string;
  summary: string;
  versions: string[];
  changelog: string;
  downloads: number;
  files: Files;
}

export const CLAWHUB_SKILLS: ClawhubFixture[] = [
  {
    owner: "sveltecraft",
    slug: "svelte-patterns",
    displayName: "Svelte patterns",
    summary: "Runes, stores and component patterns for Svelte 5.",
    versions: ["1.0.0"],
    changelog: "First release: runes, snippets and stores.",
    downloads: 5200,
    files: SVELTE_PATTERNS,
  },
  {
    owner: "maria-dev",
    slug: "code-review",
    displayName: "code-review",
    summary: "Review a diff for correctness, security and style before it merges.",
    versions: ["1.2.0", "1.1.0", "1.0.0"],
    changelog: "Shorter summaries.",
    downloads: 3100,
    files: CODE_REVIEW,
  },
];

/** The ClawHub account a saved token signs in as, and the one token ClawHub refuses. */
export const CLAWHUB_HANDLE = "maria-dev";
export const CLAWHUB_REFUSED_TOKEN = "clh_bad_one";

/** The GitHub account any token signs in as, and its repositories that are public. */
export const GITHUB_LOGIN = "dev";
export const GITHUB_PUBLIC_REPOSITORIES = ["public-skills"];
