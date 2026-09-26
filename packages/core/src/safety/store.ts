import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SafetyReport } from "@loadout/shared";
import { writeJsonAtomic } from "../util/fs";

/**
 * The last safety report of each library skill, in the library's cache folder. It is a cache: it
 * belongs to this computer, clearing it only means scanning again, and it is never backed up.
 */

const FILE_NAME = "safety.json";
const FORMAT_VERSION = 1;

export interface StoredReport {
  contentHash: string;
  report: SafetyReport;
}

interface StoreFile {
  version: number;
  skills: Record<string, StoredReport>;
}

export class SafetyStore {
  readonly #path: string;

  constructor(cacheDir: string) {
    this.#path = join(cacheDir, FILE_NAME);
  }

  all(): Record<string, StoredReport> {
    try {
      const file = JSON.parse(readFileSync(this.#path, "utf8")) as Partial<StoreFile>;
      return file.version === FORMAT_VERSION && file.skills ? file.skills : {};
    } catch {
      return {};
    }
  }

  get(skillId: string): StoredReport | null {
    return this.all()[skillId] ?? null;
  }

  put(skillId: string, entry: StoredReport): void {
    this.#write({ ...this.all(), [skillId]: entry });
  }

  /** Keep only the skills still in the library. */
  retain(skillIds: ReadonlySet<string>): void {
    const skills = this.all();
    const kept = Object.fromEntries(Object.entries(skills).filter(([id]) => skillIds.has(id)));
    if (Object.keys(kept).length !== Object.keys(skills).length) this.#write(kept);
  }

  #write(skills: Record<string, StoredReport>): void {
    const file: StoreFile = { version: FORMAT_VERSION, skills };
    writeJsonAtomic(this.#path, file);
  }
}
