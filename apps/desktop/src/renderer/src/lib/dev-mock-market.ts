/**
 * DEV ONLY. Marketplace handlers for the in-memory preview bridge in `dev-mock.ts`: boards,
 * search, and whether each entry is in the library. Searching "offline" fails with NETWORK.
 */
import { MARKETPLACE_URL, type MarketBoard, type MarketSkill } from "@loadout/shared";
import type { InstallMockContext } from "@/lib/dev-mock-install";

const BOARD_SIZE = 60;

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

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length] as T;
}

const CATALOG: Omit<MarketSkill, "installed">[] = Array.from({ length: 130 }, (_, index) => {
  const source = pick(SOURCES, index * 7 + (index % 3));
  const round = Math.floor(index / TOPICS.length);
  const skillId = round === 0 ? pick(TOPICS, index) : `${pick(TOPICS, index)}-${round + 1}`;
  return {
    id: `${source}/${skillId}`,
    skillId,
    name: skillId,
    source,
    installs: Math.round(980_000 / (index + 1) ** 1.3) + ((index * 37) % 90),
  };
});

const BOARD_ORDER: Record<MarketBoard, (index: number) => number> = {
  all_time: (index) => index,
  hot: (index) => (index * 17) % CATALOG.length,
  trending: (index) => (index * 29 + 11) % CATALOG.length,
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

  return {
    "market.board": (board: MarketBoard) =>
      withInstalled(
        Array.from({ length: BOARD_SIZE }, (_, index) => pick(CATALOG, BOARD_ORDER[board](index))),
      ),
    "market.search": (query: string, limit?: number) => {
      const needle = query.trim().toLowerCase();
      if (needle === "offline") ctx.fail("NETWORK", `Could not resolve host: ${MARKETPLACE_URL}`);
      return withInstalled(
        CATALOG.filter((entry) => entry.id.toLowerCase().includes(needle)).slice(0, limit ?? 50),
      );
    },
  };
}
