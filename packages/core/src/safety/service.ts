import {
  type FlaggedSkill,
  SAFETY_SCAN_LIBRARY_KEY,
  type SafetyApi,
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
import { type ScannerProgram, findScanner, runScanner, scannerVersion } from "./scanner";
import { SafetyStore } from "./store";

export interface SafetyServiceDeps {
  store: SkillStore;
  /** Tests only: run this instead of the real scanner. */
  scan?: (programPath: string, skillDir: string) => Promise<SafetyReport>;
  /** Tests only: the program to use, instead of looking for one. */
  findProgram?: () => ScannerProgram | null;
}

/** A skill about to be installed: what it will be called and where its files are now. */
export interface SafetyCandidate {
  name: string;
  dir: string;
}

export interface SafetyService {
  api: SafetyApi;
  /**
   * Scan skills before they are installed. Throws UNSAFE, listing every flagged one, unless
   * `acceptRisk`. Skipped (null reports) when the scanner is missing or switched off, and for a
   * skill it could not scan: a broken scanner must never stop installs.
   */
  check(
    candidates: readonly SafetyCandidate[],
    options: { acceptRisk?: boolean; progressKey?: string },
  ): Promise<(SafetyReport | null)[]>;
  /** Keep the report a skill was installed with, so the library shows it without a rescan. */
  remember(skill: Skill, report: SafetyReport | null): void;
}

/** Scans run side by side; each is its own process. */
const SCAN_WORKERS = 3;
/** How long the found program and its version are trusted before looking again. */
const PROGRAM_TTL_MS = 60_000;

function flaggedMessage(flagged: readonly FlaggedSkill[]): string {
  const [only] = flagged;
  const subject = only && flagged.length === 1 ? only.name : `${flagged.length} skills`;
  return `The safety check flagged ${subject}. Read the findings, then install anyway only if you trust the source.`;
}

function toRecord(skill: Skill, contentHash: string, report: SafetyReport): SafetyRecord {
  return { ...report, skillId: skill.id, contentHash, stale: skill.contentHash !== contentHash };
}

export function createSafetyService(ctx: CoreContext, deps: SafetyServiceDeps): SafetyService {
  const { store } = deps;
  const reports = new SafetyStore(ctx.paths.cacheDir);
  const scan = deps.scan ?? runScanner;
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

  async function requireProgram(): Promise<ScannerProgram> {
    const found = await currentProgram();
    if (!found) {
      throw unsupported(
        "SkillSpector is not installed. Install it, or set where it is in Settings → Safety.",
      );
    }
    return found;
  }

  async function scanOne(found: ScannerProgram, skill: Skill): Promise<SafetyRecord> {
    const hash = skill.contentHash ?? "";
    const report = await scan(found.path, skill.libraryPath);
    reports.put(skill.id, { contentHash: hash, report });
    return toRecord(skill, hash, report);
  }

  const api: SafetyApi = {
    status: async (): Promise<SafetyStatus> => {
      const found = await currentProgram();
      return {
        available: found !== null,
        path: found?.path ?? null,
        version: found?.version ?? null,
        scanOnInstall: ctx.settings.get("safetyScanOnInstall"),
      };
    },

    list: async () => {
      const skills = store.list();
      reports.retain(new Set(skills.map((skill) => skill.id)));
      const stored = reports.all();
      return skills.flatMap((skill) => {
        const entry = stored[skill.id];
        return entry ? [toRecord(skill, entry.contentHash, entry.report)] : [];
      });
    },

    scanSkill: async (skillId) => {
      const skill = store.get(skillId);
      const record = await scanOne(await requireProgram(), skill);
      ctx.touched("safety");
      return record;
    },

    scanLibrary: async (force = false) => {
      const found = await requireProgram();
      const stored = reports.all();
      const due = store
        .list()
        .filter((skill) => force || stored[skill.id]?.contentHash !== skill.contentHash);
      const summary: SafetyScanSummary = { scanned: 0, unsafe: 0, caution: 0, failed: [] };
      let done = 0;
      await mapLimit(due, SCAN_WORKERS, async (skill) => {
        try {
          const record = await scanOne(found, skill);
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
    },
  };

  async function check(
    candidates: readonly SafetyCandidate[],
    options: { acceptRisk?: boolean; progressKey?: string },
  ): Promise<(SafetyReport | null)[]> {
    if (candidates.length === 0 || !ctx.settings.get("safetyScanOnInstall")) {
      return candidates.map(() => null);
    }
    const found = await currentProgram();
    if (!found) return candidates.map(() => null);
    let done = 0;
    const results = await mapLimit(candidates, SCAN_WORKERS, async (candidate) => {
      if (options.progressKey) {
        ctx.emit("install:progress", {
          key: options.progressKey,
          phase: "checking",
          current: done + 1,
          total: candidates.length,
          name: candidate.name,
        });
      }
      try {
        return await scan(found.path, candidate.dir);
      } catch (error) {
        ctx.log.warn(`Safety check skipped for ${candidate.name}: ${errorMessage(error)}`);
        return null;
      } finally {
        done += 1;
      }
    });
    const flagged = candidates.flatMap((candidate, index): FlaggedSkill[] => {
      const report = results[index];
      return report?.verdict === "unsafe" ? [{ name: candidate.name, report }] : [];
    });
    if (flagged.length > 0 && !options.acceptRisk) {
      throw new AppError("UNSAFE", flaggedMessage(flagged), { flagged });
    }
    return results;
  }

  function remember(skill: Skill, report: SafetyReport | null): void {
    if (!report || !skill.contentHash) return;
    try {
      reports.put(skill.id, { contentHash: skill.contentHash, report });
    } catch (error) {
      ctx.log.warn(`Could not keep the safety report of ${skill.name}`, error);
    }
  }

  return { api, check, remember };
}
