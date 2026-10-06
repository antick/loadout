import {
  type FlaggedSkill,
  MINUTE_MS,
  type UncheckedSkill,
  SAFETY_SCAN_LIBRARY_KEY,
  type SafetyApi,
  type SafetyEngine,
  type SafetyRecord,
  type SafetyReport,
  type SafetyScanSummary,
  type SafetyStatus,
  type Skill,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, errorMessage, unsupported } from "../errors";
import type { SkillStore } from "../skills/store";
import { mapLimit } from "../util/async";
import { scanWithRules } from "./builtin";
import { BUILTIN_RULES_VERSION } from "./rules";
import { type ScannerProgram, findScanner, runScanner, scannerVersion } from "./scanner";
import { SafetyStore, type StoredReport } from "./store";

export interface SafetyServiceDeps {
  store: SkillStore;
  /** Tests only: the program to use, instead of looking for one. */
  findProgram?: () => ScannerProgram | null;
  /** Run Loadout's own rules when SkillSpector is not found (default true; tests turn it off). */
  builtin?: boolean;
}

/** A skill about to be installed: what it will be called and where its files are now. */
export interface SafetyCandidate {
  name: string;
  dir: string;
}

export interface SafetyService {
  api: SafetyApi;
  /**
   * Scan skills before they are installed. Throws UNSAFE, listing every flagged one, and every
   * one the check could not finish on, unless `acceptRisk`. Skipped (null reports) when the
   * check is switched off or no engine is available.
   */
  check(
    candidates: readonly SafetyCandidate[],
    options: { acceptRisk?: boolean; progressKey?: string },
  ): Promise<(SafetyReport | null)[]>;
  /** Keep the report a skill was installed with, so the library shows it without a rescan. */
  remember(skill: Skill, report: SafetyReport | null): void;
  /** Built-in rules over every skill without a current report; how many were checked. */
  scanDueQuietly(): Promise<number>;
}

/** Scans run side by side; each is its own process. */
const SCAN_WORKERS = 3;
/** How long the found program and its version are trusted before looking again. */
const PROGRAM_TTL_MS = MINUTE_MS;

function flaggedMessage(
  flagged: readonly FlaggedSkill[],
  unchecked: readonly UncheckedSkill[],
): string {
  if (flagged.length === 0) {
    const [only] = unchecked;
    const subject = only && unchecked.length === 1 ? only.name : `${unchecked.length} skills`;
    return `The safety check could not finish on ${subject}. Install anyway only if you trust the source.`;
  }
  const [only] = flagged;
  const subject = only && flagged.length === 1 ? only.name : `${flagged.length} skills`;
  return `The safety check flagged ${subject}. Read the findings, then install anyway only if you trust the source.`;
}

/**
 * A kept report still speaks for the skill: made from the same files and, for Loadout's own
 * rules, by the rules this version has. A report from older rules is checked again.
 */
function isCurrent(skill: Skill, entry: StoredReport | undefined): boolean {
  if (!entry || entry.contentHash !== skill.contentHash) return false;
  return entry.report.engine !== "builtin" || entry.report.scannerVersion === BUILTIN_RULES_VERSION;
}

function toRecord(skill: Skill, contentHash: string, report: SafetyReport): SafetyRecord {
  const stale = !isCurrent(skill, { contentHash, report });
  return { ...report, skillId: skill.id, contentHash, stale };
}

export function createSafetyService(ctx: CoreContext, deps: SafetyServiceDeps): SafetyService {
  const { store } = deps;
  const reports = new SafetyStore(ctx.paths.cacheDir);
  const builtin = deps.builtin ?? true;
  let program: { value: ScannerProgram | null; at: number; configured: string } | null = null;

  /** The scanner, looked for again when the setting changed or a minute went by. */
  async function currentProgram(): Promise<ScannerProgram | null> {
    const configured = ctx.settings.get("safetyScannerPath");
    const now = Date.now();
    if (program && program.configured === configured && now - program.at < PROGRAM_TTL_MS) {
      return program.value;
    }
    let value: ScannerProgram | null;
    if (deps.findProgram) value = deps.findProgram();
    else {
      const path = findScanner(ctx.homeDir, configured);
      value = path ? { path, version: await scannerVersion(path) } : null;
    }
    program = { value, at: now, configured };
    return value;
  }

  /** What checks a folder now: SkillSpector when found, else the built-in rules, else nothing. */
  type Engine = { kind: "skillspector"; program: ScannerProgram } | { kind: "builtin" };

  async function currentEngine(): Promise<Engine | null> {
    const found = await currentProgram();
    if (found) return { kind: "skillspector", program: found };
    return builtin ? { kind: "builtin" } : null;
  }

  async function requireEngine(): Promise<Engine> {
    const engine = await currentEngine();
    if (!engine) {
      throw unsupported(
        "No safety check is available. Install SkillSpector, or set where it is in Settings → Safety.",
      );
    }
    return engine;
  }

  /**
   * One folder's report. SkillSpector failing to run is no verdict on the skill: the built-in
   * rules check it instead, when they are on, and the report names them as its engine, so the
   * skill shows it was not checked by SkillSpector. A report SkillSpector does give stands.
   */
  async function scanDir(engine: Engine, dir: string, name: string): Promise<SafetyReport> {
    if (engine.kind === "builtin") return scanWithRules(dir);
    try {
      return await runScanner(engine.program.path, dir);
    } catch (error) {
      if (!builtin) throw error;
      ctx.log.warn(
        `SkillSpector could not check ${name}, so the built-in rules did: ${errorMessage(error)}`,
      );
      return scanWithRules(dir);
    }
  }

  async function scanOne(engine: Engine, skill: Skill): Promise<SafetyRecord> {
    const hash = skill.contentHash ?? "";
    const report = await scanDir(engine, skill.libraryPath, skill.name);
    reports.put(skill.id, { contentHash: hash, report });
    return toRecord(skill, hash, report);
  }

  const api: SafetyApi = {
    status: async (): Promise<SafetyStatus> => {
      const found = await currentProgram();
      const engine: SafetyEngine | null = found ? "skillspector" : builtin ? "builtin" : null;
      return {
        engine,
        available: found !== null,
        path: found?.path ?? null,
        version: found?.version ?? null,
        scanOnInstall: ctx.settings.get("safetyScanOnInstall"),
      };
    },

    list: async () => {
      const skills = store.list();
      const stored = reports.all();
      return skills.flatMap((skill) => {
        const entry = stored[skill.id];
        return entry ? [toRecord(skill, entry.contentHash, entry.report)] : [];
      });
    },

    scanSkill: async (skillId) => {
      const skill = store.get(skillId);
      const record = await scanOne(await requireEngine(), skill);
      ctx.touched("safety");
      return record;
    },

    scanLibrary: (force = false) => reports.batch(() => scanLibrary(force)),
  };

  async function scanLibrary(force: boolean): Promise<SafetyScanSummary> {
    const engine = await requireEngine();
    const skills = store.list();
    // Reports of skills no longer in the library go with this write.
    reports.retain(new Set(skills.map((skill) => skill.id)));
    const stored = reports.all();
    // A built-in report is due again once SkillSpector is there: a deeper check is worth
    // having. The other way round, a SkillSpector report is kept until the files change.
    const deeper = engine.kind === "skillspector";
    const due = skills.filter(
      (skill) =>
        force ||
        !isCurrent(skill, stored[skill.id]) ||
        (deeper && stored[skill.id]?.report.engine !== engine.kind),
    );
    const summary: SafetyScanSummary = { scanned: 0, unsafe: 0, caution: 0, failed: [] };
    let done = 0;
    await mapLimit(due, SCAN_WORKERS, async (skill) => {
      try {
        const record = await scanOne(engine, skill);
        summary.scanned += 1;
        if (record.verdict === "unsafe") summary.unsafe += 1;
        if (record.verdict === "caution") summary.caution += 1;
      } catch (error) {
        summary.failed.push({ name: skill.name, message: errorMessage(error) });
      }
      done += 1;
      ctx.emit("install:progress", {
        key: SAFETY_SCAN_LIBRARY_KEY,
        phase: "checking",
        current: done,
        total: due.length,
        name: skill.name,
      });
    });
    ctx.emit("install:progress", { key: SAFETY_SCAN_LIBRARY_KEY, phase: "done" });
    ctx.activity.record(
      "scan",
      `${summary.scanned} skills`,
      `${summary.unsafe} flagged, ${summary.caution} to review`,
      summary.failed.length === 0,
    );
    ctx.touched("safety");
    return summary;
  }

  async function check(
    candidates: readonly SafetyCandidate[],
    options: { acceptRisk?: boolean; progressKey?: string },
  ): Promise<(SafetyReport | null)[]> {
    if (candidates.length === 0 || !ctx.settings.get("safetyScanOnInstall")) {
      return candidates.map(() => null);
    }
    const engine = await currentEngine();
    if (!engine) return candidates.map(() => null);
    const unchecked: UncheckedSkill[] = [];
    const results = await mapLimit(candidates, SCAN_WORKERS, async (candidate, index) => {
      if (options.progressKey) {
        ctx.emit("install:progress", {
          key: options.progressKey,
          phase: "checking",
          current: index + 1,
          total: candidates.length,
          name: candidate.name,
        });
      }
      try {
        return await scanDir(engine, candidate.dir, candidate.name);
      } catch (error) {
        // Not a pass: a skill can make the scanner crash or hang on purpose.
        ctx.log.warn(`Safety check could not finish for ${candidate.name}: ${errorMessage(error)}`);
        unchecked.push({ name: candidate.name, reason: errorMessage(error) });
        return null;
      }
    });
    const flagged = candidates.flatMap((candidate, index): FlaggedSkill[] => {
      const report = results[index];
      return report?.verdict === "unsafe" ? [{ name: candidate.name, report }] : [];
    });
    if ((flagged.length > 0 || unchecked.length > 0) && !options.acceptRisk) {
      throw new AppError("UNSAFE", flaggedMessage(flagged, unchecked), { flagged, unchecked });
    }
    return results;
  }

  /**
   * Check library skills that have no current report, quietly: no progress, no activity entry.
   * For the app's start, with the built-in rules even where SkillSpector is found: it runs a
   * process per skill, too slow for every start.
   */
  async function scanDueQuietly(): Promise<number> {
    if (!builtin) return 0;
    const engine: Engine = { kind: "builtin" };
    const scanned = await reports.batch(async () => {
      const skills = store.list();
      reports.retain(new Set(skills.map((skill) => skill.id)));
      const stored = reports.all();
      const due = skills.filter((skill) => !isCurrent(skill, stored[skill.id]));
      let count = 0;
      for (const skill of due) {
        try {
          await scanOne(engine, skill);
          count += 1;
        } catch (error) {
          ctx.log.warn(`Safety check could not finish for ${skill.name}: ${errorMessage(error)}`);
        }
      }
      return count;
    });
    if (scanned > 0) ctx.touched("safety");
    return scanned;
  }

  function remember(skill: Skill, report: SafetyReport | null): void {
    if (!report || !skill.contentHash) return;
    try {
      reports.put(skill.id, { contentHash: skill.contentHash, report });
    } catch (error) {
      ctx.log.warn(`Could not keep the safety report of ${skill.name}`, error);
    }
  }

  return { api, check, remember, scanDueQuietly };
}
