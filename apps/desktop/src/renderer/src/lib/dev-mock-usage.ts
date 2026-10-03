/**
 * DEV ONLY. `usage.*` for the browser preview: made-up runs for the seeded skills once tracking is
 * turned on, so the library sorts, the detail line and the dashboard card have something to show.
 */
import type { DataScope, Skill, SkillUsage, UsageReport } from "@loadout/shared";
import type { MockHandlers } from "@/lib/dev-mock-types";

const READ_MS = 900;
const HOUR = 60 * 60 * 1000;
/** Runs per seeded skill (by position), and hours since the last one. Missing ones never ran. */
const SEED_RUNS: readonly { uses: number; recent: number; hoursAgo: number }[] = [
  { uses: 42, recent: 17, hoursAgo: 3 },
  { uses: 18, recent: 9, hoursAgo: 26 },
  { uses: 7, recent: 0, hoursAgo: 45 * 24 },
  { uses: 5, recent: 2, hoursAgo: 5 * 24 },
];
const PROJECTS = ["Projects/shop-web", "Projects/billing-api", "Projects/docs-site"];

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Tracking starts off here, as in the app; the mock keeps its own switch. */
export function createUsageMockHandlers(
  home: string,
  getSkills: () => Skill[],
  emitChanged: (...scope: DataScope[]) => void,
): MockHandlers {
  let enabled = false;
  let scannedAt: number | null = null;

  function seeded(): SkillUsage[] {
    const now = Date.now();
    return getSkills().flatMap((skill, index): SkillUsage[] => {
      const runs = SEED_RUNS[index];
      if (!runs) return [];
      return [
        {
          skillId: skill.id,
          uses: runs.uses,
          recentUses: runs.recent,
          lastUsedAt: now - runs.hoursAgo * HOUR,
          byAgent:
            index % 2 === 0 ? { claude_code: runs.uses - 2, codex: 2 } : { claude_code: runs.uses },
          projects: PROJECTS.slice(0, (index % PROJECTS.length) + 1).map(
            (path) => `${home}/${path}`,
          ),
        },
      ];
    });
  }

  function report(): UsageReport {
    const logs: UsageReport["logs"] = [
      { agentKey: "claude_code", path: `${home}/.claude/projects`, found: true },
      { agentKey: "codex", path: `${home}/.codex/sessions`, found: false },
    ];
    if (!enabled) return { enabled: false, scannedAt: null, skills: [], logs };
    return { enabled: true, scannedAt, skills: scannedAt ? seeded() : [], logs };
  }

  async function scan(): Promise<UsageReport> {
    if (!enabled) return report();
    await wait(READ_MS);
    scannedAt = Date.now();
    return report();
  }

  return {
    "usage.report": () => report(),
    "usage.scan": () => scan(),
    "usage.setEnabled": async (on: boolean) => {
      enabled = on;
      if (!on) scannedAt = null;
      const next = on ? await scan() : report();
      emitChanged("settings");
      return next;
    },
  };
}
