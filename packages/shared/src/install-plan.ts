import type { SafetyReport } from "./safety";
import type { SkillTrait } from "./skill-traits";

/**
 * What importing a skill under a name does to the library, worked out before anything is written.
 * Mirrors the library's own rule (`core/install/library.ts`): a skill lands in `<name>`; when that
 * folder holds other content it lands in `<name>-2`, `-3`, and so on. Folder names are compared
 * without letter case, as on macOS and Windows, so the plan never promises a name that is taken.
 */

/** A folder already in the library, as an import preview sees it. */
export interface LibraryNameEntry {
  /** Folder name inside the library. */
  dirName: string;
  /** The library skill in that folder; null for a folder no skill owns. */
  skillId: string | null;
  skillName: string | null;
  /** Where that skill came from, safe to show (no credentials); null when it has no source. */
  source: string | null;
  /** It came from the very source being previewed. */
  sameSource: boolean;
}

/**
 * - `new`: nothing has that name; it is added under it.
 * - `installed`: this source already put a skill there. The same content is kept as is; changed
 *   content is added next to it as `installAs`.
 * - `taken`: another skill (or a stray folder) has the name; this one is added as `installAs`,
 *   unless its content is identical to what holds the name (the library then keeps that one).
 * - `repeated`: an earlier row of the same import claims the name; added as `installAs`.
 * - `replaces`: the user chose to put this one in place of the library skill holding the name. It
 *   keeps that skill's folder, tags, presets and agents; the old version goes to Recently removed.
 */
export type InstallOutcomeKind = "new" | "installed" | "taken" | "repeated" | "replaces";

export interface InstallOutcome {
  kind: InstallOutcomeKind;
  /** The name it is added under when its content differs from what holds the name. */
  installAs: string;
  /** What holds the name now; null for `new` and `repeated`. */
  owner: LibraryNameEntry | null;
}

/** Suffix separator of numbered names, as in `pdf-2`. */
const NUMBER_SEPARATOR = "-";
const FIRST_NUMBER = 2;

const nameKey = (name: string): string => name.trim().toLowerCase();

/**
 * First of `name`, `name-2`, `name-3`, … that `isFree` accepts. The dry-run planner and every
 * real install, rename or copy number names this one way.
 */
export function firstFreeName(
  name: string,
  isFree: (candidate: string) => boolean,
  separator = NUMBER_SEPARATOR,
): string {
  if (isFree(name)) return name;
  let n = FIRST_NUMBER;
  while (!isFree(`${name}${separator}${n}`)) n += 1;
  return `${name}${separator}${n}`;
}

/** First of `name`, `name-2`, … whose key is not in `taken`. */
const nextFreeName = (name: string, taken: ReadonlySet<string>): string =>
  firstFreeName(name, (candidate) => !taken.has(nameKey(candidate)));

/** A library skill (not a stray folder) holds the name, so the import may replace it. */
export function canReplace(outcome: InstallOutcome): boolean {
  if (outcome.kind === "replaces") return true;
  return (
    (outcome.kind === "taken" || outcome.kind === "installed") && Boolean(outcome.owner?.skillId)
  );
}

/**
 * Outcomes for the rows of one import, in order: each row also sees the names the rows before it
 * claimed. `names` holds the name each row is imported under; `claims[i]` false leaves row `i` out
 * of the import (an unticked row), so it takes no name from the rows after it. `replaces[i]` asks
 * row `i` to replace the library skill holding its name, where one does.
 */
export function planInstallNames(
  names: readonly string[],
  library: readonly LibraryNameEntry[],
  claims?: readonly boolean[],
  replaces?: readonly boolean[],
): InstallOutcome[] {
  const byKey = new Map(library.map((entry) => [nameKey(entry.dirName), entry]));
  const taken = new Set(byKey.keys());
  const claimed = new Set<string>();
  return names.map((raw, index) => {
    const name = raw.trim();
    const key = nameKey(name);
    const owner = byKey.get(key) ?? null;
    let outcome: InstallOutcome;
    if (claimed.has(key)) {
      outcome = { kind: "repeated", installAs: nextFreeName(name, taken), owner: null };
    } else if (owner?.skillId && replaces?.[index]) {
      outcome = { kind: "replaces", installAs: owner.dirName, owner };
    } else if (owner) {
      outcome = {
        kind: owner.sameSource ? "installed" : "taken",
        installAs: nextFreeName(name, taken),
        owner,
      };
    } else {
      outcome = { kind: "new", installAs: name, owner: null };
    }
    if (claims?.[index] !== false) {
      claimed.add(key);
      taken.add(nameKey(outcome.installAs));
    }
    return outcome;
  });
}

/** One skill `skills install --dry-run` would add, and what its name would do. */
export interface InstallPlanRow {
  name: string;
  /** Its folder in the source; null for a folder installed as a whole. */
  relPath: string | null;
  outcome: InstallOutcome;
  manualOnly: boolean;
  /** What installing it puts in reach of an agent: scripts, hooks, MCP servers, tools. */
  traits: SkillTrait[];
  /** The safety check's report, as the real install would keep it; null when the check is off. */
  safety: SafetyReport | null;
}

/** What `skills install --dry-run` reports. Nothing is written. */
export interface InstallPlan {
  dryRun: true;
  source: string;
  /** What would be installed: the same key the real install reports what it installed under. */
  installed: InstallPlanRow[];
  /** A marketplace skill already installed is refreshed in place, keeping its name. */
  refreshesInPlace: boolean;
  /** Another site the download moved to; a real install has to be told to accept it. */
  redirectedTo: string | null;
}
