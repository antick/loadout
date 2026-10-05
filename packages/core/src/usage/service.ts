import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Skill,
  type SkillUsage,
  USAGE_PROJECTS_LIMIT,
  USAGE_RECENT_MS,
  type UsageAgentKey,
  type UsageApi,
  type UsageLogSource,
  type UsageReport,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import type { SkillStore } from "../skills/store";
import { listLogFiles, readMarkedLines } from "./log-files";
import { LOG_READERS, type LogFileState, type LogReader, type UsageEvent } from "./parse";
import { type NameCount, type NameProject, type UsageStore, createUsageStore } from "./store";

export interface UsageServiceDeps {
  store: SkillStore;
}

export interface UsageService {
  api: UsageApi;
}

/** Where each agent keeps its session logs: its home folder variable, else its dot folder. */
const LOG_ROOTS: Record<UsageAgentKey, { variable: string; home: string; logs: string }> = {
  claude_code: { variable: "CLAUDE_CONFIG_DIR", home: ".claude", logs: "projects" },
  codex: { variable: "CODEX_HOME", home: ".codex", logs: "sessions" },
};

function logRoot(ctx: CoreContext, agentKey: UsageAgentKey): string {
  const { variable, home, logs } = LOG_ROOTS[agentKey];
  const fromEnv = ctx.env()[variable]?.trim();
  return join(fromEnv || join(ctx.homeDir, home), logs);
}

/** The names a skill may be run by, lower case: its name and its folder's name. */
function namesOf(skill: Skill): Set<string> {
  return new Set([skill.name.toLowerCase(), skill.dirName.toLowerCase()]);
}

/** Put the per-name counts on the library skills they belong to. */
function toSkillUsage(
  skills: readonly Skill[],
  counts: readonly NameCount[],
  projects: readonly NameProject[],
): SkillUsage[] {
  return skills.flatMap((skill): SkillUsage[] => {
    const names = namesOf(skill);
    const mine = counts.filter((count) => names.has(count.name));
    if (mine.length === 0) return [];
    const byAgent: Record<string, number> = {};
    for (const count of mine) byAgent[count.agentKey] = (byAgent[count.agentKey] ?? 0) + count.uses;
    const folders: string[] = [];
    for (const project of projects) {
      if (!names.has(project.name) || folders.includes(project.projectPath)) continue;
      folders.push(project.projectPath);
      if (folders.length === USAGE_PROJECTS_LIMIT) break;
    }
    return [
      {
        skillId: skill.id,
        uses: mine.reduce((sum, count) => sum + count.uses, 0),
        recentUses: mine.reduce((sum, count) => sum + count.recentUses, 0),
        lastUsedAt: Math.max(...mine.map((count) => count.lastUsedAt)),
        byAgent,
        projects: folders,
      },
    ];
  });
}

/**
 * Skill usage from the agents' own session logs. Each log is read once: later scans start where
 * the last one stopped, and a log that shrank (rewritten) is read again from the top.
 */
export function createUsageService(ctx: CoreContext, deps: UsageServiceDeps): UsageService {
  const usage: UsageStore = createUsageStore(ctx.db);
  let running: Promise<void> | null = null;

  const enabled = (): boolean => ctx.settings.get("usageTracking");

  function logs(): UsageLogSource[] {
    return LOG_READERS.map((reader) => {
      const path = logRoot(ctx, reader.agentKey);
      return { agentKey: reader.agentKey, path, found: existsSync(path) };
    });
  }

  function report(): UsageReport {
    if (!enabled()) return { enabled: false, scannedAt: null, skills: [], logs: logs() };
    const scannedAt = ctx.settings.getRaw<number | null>(INTERNAL_KEYS.usageScannedAt, null);
    const skills = toSkillUsage(
      deps.store.list(),
      usage.counts(Date.now() - USAGE_RECENT_MS),
      usage.projects(),
    );
    return { enabled: true, scannedAt, skills, logs: logs() };
  }

  async function readLogs(reader: LogReader): Promise<void> {
    for (const file of await listLogFiles(logRoot(ctx, reader.agentKey))) {
      const mark = usage.mark(file.path);
      if (mark && mark.size === file.size && mark.mtime === file.mtime) continue;
      // A log smaller than what was read was rewritten: read it again (runs are not counted twice).
      const from = mark && file.size >= mark.readTo ? mark.readTo : 0;
      const state: LogFileState = { projectPath: from > 0 ? (mark?.projectPath ?? null) : null };
      const events: UsageEvent[] = [];
      try {
        const readTo = await readMarkedLines(file.path, from, reader.markers, (line) => {
          events.push(...reader.parse(line, state));
        });
        usage.save(file.path, reader.agentKey, events, {
          size: file.size,
          mtime: file.mtime,
          readTo,
          projectPath: state.projectPath,
        });
      } catch (error) {
        // One unreadable log never stops the rest; it is tried again next time.
        ctx.log.warn(`usage: could not read ${file.path}: ${errorMessage(error)}`);
      }
    }
  }

  async function scan(): Promise<void> {
    for (const reader of LOG_READERS) await readLogs(reader);
    ctx.settings.setRaw(INTERNAL_KEYS.usageScannedAt, Date.now());
    ctx.touched("usage");
  }

  /** One scan at a time; a second caller waits for the one running. */
  async function scanOnce(): Promise<void> {
    running ??= scan().finally(() => {
      running = null;
    });
    await running;
  }

  return {
    api: {
      report: async () => report(),
      scan: async () => {
        if (enabled()) await scanOnce();
        return report();
      },
      setEnabled: async (on) => {
        ctx.settings.set("usageTracking", on);
        if (on) {
          await scanOnce();
        } else {
          await running;
          usage.clear();
          ctx.settings.deleteRaw(INTERNAL_KEYS.usageScannedAt);
          ctx.touched("usage");
        }
        ctx.touched("settings");
        return report();
      },
    },
  };
}
