/**
 * DEV ONLY. Marketplace handlers for the in-memory preview bridge in `dev-mock.ts`: boards,
 * search, whether each entry is in the library, and a skill's detail. Searching "offline" fails
 * with NETWORK. Details vary by skill: every third has no audits yet, every fifth could not load
 * them, and every seventh has no SKILL.md to show.
 */
import {
  MARKETPLACE_URL,
  type MarketAudit,
  type MarketBoard,
  type MarketProvider,
  type MarketSkill,
  type MarketSkillDetail,
  clawhubMarketId,
  clawhubSkillUrl,
} from "@loadout/shared";
import type { InstallMockContext } from "@/lib/dev-mock-install";

const BOARD_SIZE = 60;
const DETAIL_DELAY_MS = 600;
const NO_AUDITS_EVERY = 3;
const AUDITS_FAIL_EVERY = 5;
const NO_DOCUMENT_EVERY = 7;
const DAY_MS = 86_400_000;

function mockAudits(pageUrl: string, index: number): MarketAudit[] {
  const auditedAt = new Date(Date.now() - ((index % 9) + 1) * DAY_MS).toISOString();
  return [
    {
      provider: "Gen Agent Trust Hub",
      slug: "agent-trust-hub",
      status: "pass",
      summary: "Reads files and runs one shell command; nothing is sent elsewhere.",
      riskLevel: "SAFE",
    },
    { provider: "Socket", slug: "socket", status: "pass", summary: "No alerts", riskLevel: null },
    {
      provider: "Snyk",
      slug: "snyk",
      status: index % 2 === 0 ? "warn" : "pass",
      summary: index % 2 === 0 ? "Risk: MEDIUM · 1 issue" : "No issues",
      riskLevel: index % 2 === 0 ? "MEDIUM" : "LOW",
    },
  ].map((audit) => ({
    provider: audit.provider,
    status: audit.status as MarketAudit["status"],
    summary: audit.summary,
    riskLevel: audit.riskLevel,
    auditedAt,
    url: `${pageUrl}/security/${audit.slug}`,
  }));
}

function mockDocument(skillId: string): string {
  return [
    "---",
    `name: ${skillId}`,
    `description: Preview copy of ${skillId}, shown before installing.`,
    "---",
    "",
    `# ${skillId}`,
    "",
    "Use this skill when the task matches its name. It reads the files you point at and",
    "suggests changes before making them.",
    "",
    "## Steps",
    "",
    "1. Read the relevant files.",
    "2. Explain the plan in two sentences.",
    "3. Make the change, then run the checks.",
    "",
    "```sh",
    "npm test",
    "```",
  ].join("\n");
}

const SOURCES = [
  "acme/frontend",
  "acme/agent-skills",
  "northwind/devtools",
  "quietriver/writing",
  "lumen-labs/data-skills",
  "harbor/ops-playbooks",
] as const;
const TOPICS = [
  "react-patterns",
  "api-design",
  "sql-tuning",
  "release-notes",
  "test-writer",
  "pdf-toolkit",
  "changelog",
  "accessibility-audit",
  "docker-compose",
  "incident-report",
  "data-cleaning",
  "meeting-notes",
  "regex-helper",
  "commit-lint",
  "design-tokens",
  "onboarding-guide",
  "log-triage",
  "spreadsheet-formulas",
  "terraform-review",
  "prompt-library",
] as const;

/** Age of the "offline" trending board in the preview. */
const OFFLINE_COPY_AGE_MS = 2 * 60 * 60 * 1000;

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length] as T;
}

const CATALOG: Omit<MarketSkill, "installed">[] = Array.from({ length: 130 }, (_, index) => {
  const source = pick(SOURCES, index * 7 + (index % 3));
  const round = Math.floor(index / TOPICS.length);
  const skillId = round === 0 ? pick(TOPICS, index) : `${pick(TOPICS, index)}-${round + 1}`;
  return {
    provider: "skills_sh",
    id: `${source}/${skillId}`,
    skillId,
    name: skillId,
    source,
    installs: Math.round(980_000 / (index + 1) ** 1.3) + ((index * 37) % 90),
    summary: null,
    version: null,
  };
});

const PUBLISHERS = ["pskoett", "openclaw", "spclaudehome", "maria-dev"] as const;
/** ClawHub's catalogue: versioned, with a summary and a publisher handle. */
const CLAWHUB_CATALOG: Omit<MarketSkill, "installed">[] = Array.from({ length: 20 }, (_, index) => {
  const owner = pick(PUBLISHERS, index);
  const slug = pick(TOPICS, index * 3);
  return {
    provider: "clawhub",
    id: clawhubMarketId(owner, slug),
    skillId: slug,
    name: slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    source: owner,
    installs: Math.round(120_000 / (index + 1) ** 1.2),
    summary: `Use when the task is about ${slug.replace(/-/g, " ")}. Checks the input first, then does the work in small steps.`,
    version: `${1 + (index % 3)}.${index % 5}.${index % 4}`,
  };
});

const BOARD_ORDER: Record<MarketBoard, (index: number) => number> = {
  all_time: (index) => index,
  hot: (index) => (index * 17) % CATALOG.length,
  trending: (index) => (index * 29 + 11) % CATALOG.length,
  downloads: (index) => index,
  newest: (index) => index,
};
/** ClawHub's boards over its own, smaller catalogue: each shows every entry once. */
const CLAWHUB_BOARD_ORDER: Record<MarketBoard, (index: number) => number> = {
  trending: (index) => (index * 7 + 3) % CLAWHUB_CATALOG.length,
  downloads: (index) => index,
  newest: (index) => CLAWHUB_CATALOG.length - 1 - index,
  hot: (index) => index,
  all_time: (index) => index,
};

export function createMarketMockHandlers(
  ctx: InstallMockContext,
): Record<string, (...args: never[]) => unknown> {
  function withInstalled(entries: Omit<MarketSkill, "installed">[]): MarketSkill[] {
    const installed = new Set(
      ctx
        .getSkills()
        .filter((entry) => entry.sourceType === "marketplace")
        .map((entry) => entry.sourceRef),
    );
    return entries.map((entry) => ({ ...entry, installed: installed.has(entry.id) }));
  }

  function withClawhubInstalled(entries: Omit<MarketSkill, "installed">[]): MarketSkill[] {
    const installed = new Set(
      ctx
        .getSkills()
        .filter((entry) => entry.sourceType === "clawhub")
        .map((entry) => entry.sourceRef),
    );
    return entries.map((entry) => ({
      ...entry,
      installed: installed.has(`${entry.source}/${entry.skillId}`),
    }));
  }

  function clawhubDetail(owner: string, slug: string): MarketSkillDetail {
    const entry = CLAWHUB_CATALOG.find((item) => item.source === owner && item.skillId === slug);
    return {
      provider: "clawhub",
      id: clawhubMarketId(owner, slug),
      source: owner,
      skillId: slug,
      pageUrl: clawhubSkillUrl(owner, slug),
      repoUrl: null,
      version: entry?.version ?? "1.0.0",
      changelog: "Clearer steps, and the checks run before anything is written.",
      audits: [
        {
          provider: "ClawHub scan",
          status: "pass",
          summary: "No malicious behaviour found; reads files and runs the tests.",
          riskLevel: "CLEAN",
          auditedAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
          url: clawhubSkillUrl(owner, slug),
        },
      ],
      document: mockDocument(slug),
      documentPath: "SKILL.md",
    };
  }

  return {
    "market.detail": async (
      source: string,
      skillId: string,
      provider: MarketProvider = "skills_sh",
    ): Promise<MarketSkillDetail> => {
      await new Promise((resolve) => window.setTimeout(resolve, DETAIL_DELAY_MS));
      if (provider === "clawhub") return clawhubDetail(source, skillId);
      const id = `${source}/${skillId}`;
      const index =
        Math.max(
          0,
          CATALOG.findIndex((entry) => entry.id === id),
        ) + 1;
      const pageUrl = `${MARKETPLACE_URL}/${id}`;
      return {
        provider: "skills_sh",
        id,
        source,
        skillId,
        pageUrl,
        repoUrl: `https://github.com/${source}`,
        version: null,
        changelog: null,
        audits:
          index % AUDITS_FAIL_EVERY === 0
            ? null
            : index % NO_AUDITS_EVERY === 0
              ? []
              : mockAudits(pageUrl, index),
        document: index % NO_DOCUMENT_EVERY === 0 ? null : mockDocument(skillId),
        documentPath: index % NO_DOCUMENT_EVERY === 0 ? null : `skills/${skillId}/SKILL.md`,
      };
    },
    // The "trending" board plays the offline case: an older copy, with how old it is.
    "market.board": (board: MarketBoard, provider: MarketProvider = "skills_sh") => {
      if (provider === "clawhub") {
        return {
          skills: withClawhubInstalled(
            CLAWHUB_CATALOG.map((_, index) =>
              pick(CLAWHUB_CATALOG, CLAWHUB_BOARD_ORDER[board](index)),
            ),
          ),
          cachedAt: null,
        };
      }
      return {
        skills: withInstalled(
          Array.from({ length: BOARD_SIZE }, (_, index) =>
            pick(CATALOG, BOARD_ORDER[board](index)),
          ),
        ),
        cachedAt: board === "trending" ? Date.now() - OFFLINE_COPY_AGE_MS : null,
      };
    },
    "market.search": (query: string, limit?: number, provider: MarketProvider = "skills_sh") => {
      const needle = query.trim().toLowerCase();
      if (needle === "offline") ctx.fail("NETWORK", `Could not resolve host: ${MARKETPLACE_URL}`);
      if (provider === "clawhub") {
        return {
          skills: withClawhubInstalled(
            CLAWHUB_CATALOG.filter((entry) => entry.id.toLowerCase().includes(needle)).slice(
              0,
              limit ?? 50,
            ),
          ),
          cachedAt: null,
        };
      }
      return {
        skills: withInstalled(
          CATALOG.filter((entry) => entry.id.toLowerCase().includes(needle)).slice(0, limit ?? 50),
        ),
        cachedAt: null,
      };
    },
  };
}
