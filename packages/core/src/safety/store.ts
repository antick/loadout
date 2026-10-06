import { join } from "node:path";
import type { SafetyReport } from "@loadout/shared";
import { writeJsonAtomic, readJsonOrNull } from "../util/fs";

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
  /** The file's content while a batch runs; writes go here and reach the disk once at the end. */
  #batch: Record<string, StoredReport> | null = null;
  #dirty = false;

  constructor(cacheDir: string) {
    this.#path = join(cacheDir, FILE_NAME);
  }

  all(): Record<string, StoredReport> {
    return this.#batch ?? this.#read();
  }

  put(skillId: string, entry: StoredReport): void {
    if (this.#batch) {
      this.#batch[skillId] = entry;
      this.#dirty = true;
    } else {
      this.#write({ ...this.#read(), [skillId]: entry });
    }
  }

  /** Keep only the skills still in the library. */
  retain(skillIds: ReadonlySet<string>): void {
    const skills = this.all();
    const dropped = Object.keys(skills).filter((id) => !skillIds.has(id));
    if (dropped.length === 0) return;
    if (this.#batch) {
      for (const id of dropped) delete this.#batch[id];
      this.#dirty = true;
    } else {
      this.#write(Object.fromEntries(Object.entries(skills).filter(([id]) => skillIds.has(id))));
    }
  }

  /**
   * Many reports in one go: the file is read once before `fn` and written once after it, when
   * anything changed. A scan of the whole library puts hundreds of reports.
   */
  async batch<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#batch) return fn();
    this.#batch = this.#read();
    this.#dirty = false;
    try {
      return await fn();
    } finally {
      const skills = this.#batch;
      this.#batch = null;
      if (this.#dirty) this.#write(skills);
    }
  }

  #read(): Record<string, StoredReport> {
    const file = readJsonOrNull(this.#path) as Partial<StoreFile> | null;
    return file?.version === FORMAT_VERSION && file.skills ? file.skills : {};
  }

  #write(skills: Record<string, StoredReport>): void {
    const file: StoreFile = { version: FORMAT_VERSION, skills };
    writeJsonAtomic(this.#path, file);
  }
}
