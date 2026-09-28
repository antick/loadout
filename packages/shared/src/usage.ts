/**
 * How often agents run each library skill, read from the agents' own session logs on this
 * computer. Off until the user turns it on (the `usageTracking` setting). Only the skill's name,
 * the agent, the time and the project folder are kept; nothing leaves the computer.
 */

/** Agents whose session logs Loadout can read, by agent key. */
export const USAGE_AGENT_KEYS = ["claude_code", "codex"] as const;
export type UsageAgentKey = (typeof USAGE_AGENT_KEYS)[number];

/** "Recent" in the report: uses in this many days count as recent, older skills as unused. */
export const USAGE_RECENT_DAYS = 30;
export const USAGE_RECENT_MS = USAGE_RECENT_DAYS * 24 * 60 * 60 * 1000;
/** A report older than this is scanned again when the app shows usage. */
export const USAGE_STALE_MS = 15 * 60 * 1000;
/** Project folders listed per skill, most recent first. */
export const USAGE_PROJECTS_LIMIT = 5;

/** One library skill's use. Skills that were never used have no entry. */
export interface SkillUsage {
  skillId: string;
  uses: number;
  /** Uses in the last `USAGE_RECENT_DAYS` days. */
  recentUses: number;
  lastUsedAt: number;
  /** Uses per agent key. */
  byAgent: Record<string, number>;
  /** Project folders it was used in, most recent first, at most `USAGE_PROJECTS_LIMIT`. */
  projects: string[];
}

/** Where one agent keeps its session logs, and whether any are there. */
export interface UsageLogSource {
  agentKey: UsageAgentKey;
  path: string;
  found: boolean;
}

export interface UsageReport {
  enabled: boolean;
  /** When the logs were last read (epoch ms); null when never. */
  scannedAt: number | null;
  skills: SkillUsage[];
  logs: UsageLogSource[];
}

/** Usage of each skill by id, for lookups while sorting and filtering. */
export function usageById(report: UsageReport | undefined): ReadonlyMap<string, SkillUsage> {
  return new Map((report?.enabled ? report.skills : []).map((usage) => [usage.skillId, usage]));
}

/**
 * Not used lately: tracking is on and has read the logs once, and the skill was not run in the
 * last `USAGE_RECENT_DAYS` days (or ever). A skill added within that time is left out, since it
 * has not had the chance.
 */
export function isUnusedSkill(
  skill: { id: string; createdAt: number },
  usage: ReadonlyMap<string, SkillUsage>,
  now: number = Date.now(),
): boolean {
  if (now - skill.createdAt < USAGE_RECENT_MS) return false;
  const used = usage.get(skill.id);
  return !used || now - used.lastUsedAt >= USAGE_RECENT_MS;
}

export interface UsageApi {
  /** What is known now, without reading the logs. */
  report(): Promise<UsageReport>;
  /** Read what the logs gained since the last scan, then report. Needs tracking on. */
  scan(): Promise<UsageReport>;
  /** Turn tracking on (and scan) or off (and forget everything read so far). */
  setEnabled(enabled: boolean): Promise<UsageReport>;
}
