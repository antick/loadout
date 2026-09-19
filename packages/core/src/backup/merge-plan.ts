import type { PortableSkill } from "../skills/portable";
import { firstFreeName } from "../util/names";

/**
 * The merge decision table, as pure functions: given what a skill looked like at the common
 * ancestor ("base"), here ("ours") and on the remote ("theirs"), decide what the merged library
 * holds. Nothing in this file touches git or the disk.
 *
 * Skills are matched by id, never by folder name, so a rename on one device combines with an
 * edit on another. Content, folder name and metadata are decided separately.
 */

export type Side = "ours" | "theirs";

/** One skill as recorded in one commit. */
export interface SkillSide {
  /** Folder name inside the repository. */
  path: string;
  /** Git tree id of the folder: equal ids mean byte-identical content. Null when it is missing. */
  treeHash: string | null;
  meta: PortableSkill;
}

export interface SkillVersions {
  base?: SkillSide;
  ours?: SkillSide;
  theirs?: SkillSide;
}

export type SkillOutcome =
  /** Nothing to do on this device. */
  | "unchanged"
  /** Something is taken from the remote: content, folder name or metadata. */
  | "updated"
  /** Removed on the remote and untouched here. */
  | "deleted"
  /** Removed on the remote but edited here: the edit wins. */
  | "kept_local"
  /** Content changed differently on both sides: ours stays, the user decides later. */
  | "conflict";

export interface SkillPlan {
  id: string;
  outcome: SkillOutcome;
  /** Where the merged folder's content comes from. "none": the skill is not in the result. */
  content: Side | "none";
  /** Folder name in the merged library. */
  path: string | null;
  meta: PortableSkill | null;
}

export interface PresetVersion {
  /** File text, compared verbatim. */
  raw: string;
  updatedAt: number;
}

export interface PresetVersions {
  base?: PresetVersion;
  ours?: PresetVersion;
  theirs?: PresetVersion;
}

export interface PresetPlan {
  id: string;
  take: Side;
}

/** A top-level entry that no skill claims (`.gitignore`, a stray folder), by git object id. */
export interface ResidualVersions {
  base?: string;
  ours?: string;
  theirs?: string;
}

export interface ResidualPlan {
  name: string;
  action: "checkout" | "remove";
}

export interface MergeInput {
  skills: ReadonlyMap<string, SkillVersions>;
  presets: ReadonlyMap<string, PresetVersions>;
  residual: ReadonlyMap<string, ResidualVersions>;
  /** Skills still waiting for the user's choice from an earlier merge. */
  pendingConflicts: ReadonlySet<string>;
}

export interface MergePlan {
  skills: SkillPlan[];
  presets: PresetPlan[];
  residual: ResidualPlan[];
}

/**
 * The 3-way rule for one value: a side that did not change yields to the side that did.
 * "conflict" only when both changed, and to different things.
 */
export function pickSide<T>(
  base: T | undefined,
  ours: T | undefined,
  theirs: T | undefined,
): Side | "conflict" {
  if (ours === theirs) return "ours";
  if (ours === base) return "theirs";
  if (theirs === base) return "ours";
  return "conflict";
}

/** Both sides' additions are kept and both sides' removals are applied. */
export function mergeTags(base: string[], ours: string[], theirs: string[]): string[] {
  const inOurs = new Set(ours);
  const inTheirs = new Set(theirs);
  const removed = new Set(base.filter((tag) => !inOurs.has(tag) || !inTheirs.has(tag)));
  return [...new Set([...ours, ...theirs])].filter((tag) => !removed.has(tag)).sort();
}

/** Key-order independent text form, so two equal objects always compare equal. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function sameSkill(a: SkillSide, b: SkillSide): boolean {
  return a.treeHash === b.treeHash && a.path === b.path && canonical(a.meta) === canonical(b.meta);
}

function keep(id: string, side: SkillSide, outcome: SkillOutcome): SkillPlan {
  return { id, outcome, content: "ours", path: side.path, meta: side.meta };
}

function take(id: string, side: SkillSide): SkillPlan {
  return { id, outcome: "updated", content: "theirs", path: side.path, meta: side.meta };
}

function gone(id: string, outcome: SkillOutcome): SkillPlan {
  return { id, outcome, content: "none", path: null, meta: null };
}

/** Decide one skill. Folder-name clashes between skills are settled later, in `planMerge`. */
export function planSkill(id: string, versions: SkillVersions, pending = false): SkillPlan {
  const { base, ours, theirs } = versions;
  if (!ours && !theirs) return gone(id, "unchanged");
  if (ours && !theirs) {
    if (!base) return keep(id, ours, "unchanged");
    // Deleted on the remote. Our edits are worth more than their delete.
    return sameSkill(base, ours) ? gone(id, "deleted") : keep(id, ours, "kept_local");
  }
  if (!ours && theirs) {
    if (!base) return take(id, theirs);
    // Deleted here. It only comes back when the remote kept working on it.
    return sameSkill(base, theirs) ? gone(id, "unchanged") : take(id, theirs);
  }
  if (!ours || !theirs) return gone(id, "unchanged");

  const contentPick = pickSide(base?.treeHash, ours.treeHash, theirs.treeHash);
  // A skill already waiting for the user's choice stays as it is here, however the remote moves.
  const pinned = pending && theirs.treeHash !== ours.treeHash && theirs.treeHash !== base?.treeHash;
  const conflict = contentPick === "conflict" || pinned;
  const content: Side = conflict ? "ours" : contentPick;

  // Two different renames: ours wins, there is nothing to lose in a folder name.
  const path = pickSide(base?.path, ours.path, theirs.path) === "theirs" ? theirs.path : ours.path;

  const sourcePick = pickSide(
    base && canonical(base.meta.source),
    canonical(ours.meta.source),
    canonical(theirs.meta.source),
  );
  // Source details describe the content, so when both changed they follow the content.
  const sourceSide: Side = sourcePick === "conflict" ? content : sourcePick;
  const meta: PortableSkill = {
    id,
    path,
    tags: mergeTags(base?.meta.tags ?? [], ours.meta.tags, theirs.meta.tags),
    source: sourceSide === "theirs" ? theirs.meta.source : ours.meta.source,
    createdAt: ours.meta.createdAt,
  };

  const touched =
    content === "theirs" ||
    path !== ours.path ||
    canonical(meta.tags) !== canonical([...ours.meta.tags].sort()) ||
    sourceSide === "theirs";
  const outcome: SkillOutcome = conflict ? "conflict" : touched ? "updated" : "unchanged";
  return { id, outcome, content, path, meta };
}

/** Newest edit wins; an edit always beats a delete. */
export function planPreset(versions: PresetVersions): Side {
  const { base, ours, theirs } = versions;
  const pick = pickSide(base?.raw, ours?.raw, theirs?.raw);
  if (pick !== "conflict") return pick;
  if (!ours) return "theirs";
  if (!theirs) return "ours";
  return theirs.updatedAt > ours.updatedAt ? "theirs" : "ours";
}

/** Folder names compare the way a case-insensitive disk sees them. */
function pathKey(path: string): string {
  return path.normalize("NFC").toLowerCase();
}

/**
 * Two skills may want the same folder (the same skill installed separately on two devices gets
 * two ids). Skills already on this device keep their folder; an incoming one gets the next free
 * name. Deterministic: same input, same names.
 */
function settlePaths(plans: SkillPlan[], skills: ReadonlyMap<string, SkillVersions>): void {
  const taken = new Set<string>();
  const present = plans.filter((plan) => plan.path !== null && plan.meta !== null);
  const local = present.filter((plan) => skills.get(plan.id)?.ours);
  const incoming = present.filter((plan) => !skills.get(plan.id)?.ours);

  const claim = (plan: SkillPlan, candidates: string[]): void => {
    const wanted = candidates.find((candidate) => !taken.has(pathKey(candidate)));
    const path =
      wanted ?? firstFreeName(candidates[0] ?? plan.id, (name) => !taken.has(pathKey(name)));
    taken.add(pathKey(path));
    if (plan.meta && path !== plan.path) plan.meta = { ...plan.meta, path };
    plan.path = path;
  };

  // Folders that stay where they are claim first, so a rename never pushes a settled skill out.
  const staying = local.filter((plan) => plan.path === skills.get(plan.id)?.ours?.path);
  const moving = local.filter((plan) => plan.path !== skills.get(plan.id)?.ours?.path);
  for (const plan of staying) claim(plan, [plan.path ?? plan.id]);
  for (const plan of moving) {
    claim(plan, [plan.path ?? plan.id, skills.get(plan.id)?.ours?.path ?? plan.id]);
  }
  for (const plan of incoming) claim(plan, [plan.path ?? plan.id]);
}

export function planMerge(input: MergeInput): MergePlan {
  const ids = [...input.skills.keys()].sort();
  const skills = ids.map((id) =>
    planSkill(id, input.skills.get(id) ?? {}, input.pendingConflicts.has(id)),
  );
  settlePaths(skills, input.skills);

  const presets: PresetPlan[] = [...input.presets.keys()]
    .sort()
    .map((id) => ({ id, take: planPreset(input.presets.get(id) ?? {}) }));

  const residual: ResidualPlan[] = [];
  for (const name of [...input.residual.keys()].sort()) {
    const versions = input.residual.get(name) ?? {};
    if (pickSide(versions.base, versions.ours, versions.theirs) !== "theirs") continue;
    residual.push({ name, action: versions.theirs === undefined ? "remove" : "checkout" });
  }

  return { skills, presets, residual };
}
