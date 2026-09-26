import { join, resolve } from "node:path";
import type {
  BatchImportResult,
  DiscoveredLocation,
  DiscoveredSkill,
  InstallOptions,
  ScanResult,
  Skill,
  SourceType,
} from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage, invalid } from "../errors";
import type { InstallIntoLibrary } from "../install/library";
import { type SafetyGate, batchFailureMessage, installChecked } from "../install/safety-gate";
import { findSkillDirs } from "../install/repo-scan";
import { readSkillIdentity } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import {
  canonicalPath,
  isDirectory,
  isInside,
  isSkillDir,
  normalizeAbsolutePath,
  readDirSafe,
  targetIdentity,
} from "../util/fs";
import { hashDir } from "../util/hash";

export interface ScanServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  install: InstallIntoLibrary;
  safety?: SafetyGate;
}

export interface ScanService {
  scanLocal(): Promise<ScanResult>;
  importDiscovered(path: string, name?: string, options?: InstallOptions): Promise<Skill>;
  importAllDiscovered(): Promise<BatchImportResult>;
}

/** Depth 1 = direct children only. */
const FLAT_DEPTH = 1;
/** Source types whose `sourceRef` is a folder on this machine. */
const PATH_SOURCE_TYPES: ReadonlySet<SourceType> = new Set(["local", "import"]);

interface ScanRoot {
  agentKey: string;
  dir: string;
  /** Undefined: search until a skill folder is found (agents that keep skills in categories). */
  maxDepth: number | undefined;
}

/**
 * The folders to read, each once, with the agent it is reported under. An installed agent's own
 * folder is its own. A folder agents only also read (`~/.agents/skills`, `~/.claude/skills`) is
 * left to the agent that owns it when that agent is installed; otherwise it is reported under
 * the installed agents that read it, or under the first one that does when none is installed.
 * Extra folders are always flat.
 */
export function scanRoots(agents: readonly ResolvedAgent[]): ScanRoot[] {
  const roots: ScanRoot[] = [];
  const owned = new Set<string>();
  for (const agent of agents) {
    if (!agent.installed || !isDirectory(agent.skillsDir)) continue;
    const dir = resolve(agent.skillsDir);
    roots.push({
      agentKey: agent.key,
      dir,
      maxDepth: agent.recursiveScan ? undefined : FLAT_DEPTH,
    });
    owned.add(dir);
  }

  const readers = new Map<string, ResolvedAgent[]>();
  for (const agent of agents) {
    for (const extra of agent.extraScanDirs) {
      const dir = resolve(extra);
      if (owned.has(dir) || !isDirectory(dir)) continue;
      readers.set(dir, [...(readers.get(dir) ?? []), agent]);
    }
  }
  for (const [dir, agentsReading] of readers) {
    const installed = agentsReading.filter((agent) => agent.installed);
    const reportedUnder = installed.length > 0 ? installed : agentsReading.slice(0, 1);
    for (const agent of reportedUnder)
      roots.push({ agentKey: agent.key, dir, maxDepth: FLAT_DEPTH });
  }
  return roots;
}

/** Add one found folder to its group; same name and same content is one skill in several places. */
function record(
  groups: Map<string, DiscoveredSkill>,
  paths: Set<string>,
  location: DiscoveredLocation,
  bySourcePath: ReadonlySet<string>,
  libraryHashes: ReadonlySet<string>,
): void {
  const identity = readSkillIdentity(location.path);
  const fingerprint = hashDir(location.path);
  const imported =
    bySourcePath.has(canonicalPath(location.path)) ||
    (fingerprint !== null && libraryHashes.has(fingerprint));
  const key = `${identity.name}\n${fingerprint ?? location.path}`;
  const group = groups.get(key) ?? {
    name: identity.name,
    description: identity.description,
    fingerprint: fingerprint ?? "",
    locations: [],
    imported: false,
  };
  const known = group.locations.some(
    (l) => l.agentKey === location.agentKey && l.path === location.path,
  );
  if (!known) group.locations.push(location);
  group.imported ||= imported;
  groups.set(key, group);
  paths.add(canonicalPath(location.path));
}

/** Finds skills already sitting in agent folders and copies chosen ones into the library. */
export function createScanService(ctx: CoreContext, deps: ScanServiceDeps): ScanService {
  const { store, registry, install } = deps;
  /** Result of the latest scan. Kept in memory: it is cheap to redo and stale the moment it ends. */
  let lastScan: DiscoveredSkill[] | null = null;

  function scan(): ScanResult {
    const library = canonicalPath(ctx.paths.skillsDir);
    const skills = store.list();
    // What we deployed ourselves is not a discovery. Compare by identity so a symlinked parent
    // folder cannot hide a match, and never by following the deployed link itself.
    const ownTargets = new Set(
      store.deployments().flatMap((d) => [resolve(d.targetPath), targetIdentity(d.targetPath)]),
    );
    const bySourcePath = new Set(
      skills.flatMap((s) =>
        s.sourceRef && PATH_SOURCE_TYPES.has(s.sourceType) ? [canonicalPath(s.sourceRef)] : [],
      ),
    );
    const libraryHashes = new Set(skills.flatMap((s) => (s.contentHash ? [s.contentHash] : [])));

    const roots = scanRoots(registry.list());
    const groups = new Map<string, DiscoveredSkill>();
    const paths = new Set<string>();

    for (const root of roots) {
      // The root is a container, never a skill itself, so list its children and search those.
      for (const entry of readDirSafe(root.dir)) {
        const child = join(root.dir, entry.name);
        if (!isDirectory(child)) continue;
        const depth = root.maxDepth === undefined ? undefined : root.maxDepth - 1;
        for (const path of findSkillDirs(child, { maxDepth: depth, libraryDir: library })) {
          if (!isDirectory(path) || isInside(library, canonicalPath(path))) continue;
          if (ownTargets.has(resolve(path)) || ownTargets.has(targetIdentity(path))) continue;
          record(groups, paths, { agentKey: root.agentKey, path }, bySourcePath, libraryHashes);
        }
      }
    }

    lastScan = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    const agentsScanned = new Set(roots.map((root) => root.agentKey)).size;
    return { agentsScanned, skillsFound: paths.size, skills: lastScan };
  }

  async function importOne(
    path: string,
    name?: string,
    options: InstallOptions = {},
  ): Promise<Skill> {
    const source = normalizeAbsolutePath(path, "Skill path");
    if (!isSkillDir(source)) throw invalid(`No SKILL.md found in ${source}`);
    // Copy only: the original folder stays where it is and is neither deployed nor adopted.
    return installChecked(
      install,
      deps.safety,
      {
        sourceDir: source,
        name,
        keepExisting: true,
        activityKind: "import",
        record: { sourceType: "import", sourceRef: source, updateStatus: "local_only" },
      },
      { ...options, progressKey: path },
    );
  }

  return {
    scanLocal: async () => scan(),

    importDiscovered: async (path, name, options) => {
      const skill = await importOne(path, name, options);
      const found = canonicalPath(path);
      for (const group of lastScan ?? []) {
        if (group.locations.some((l) => canonicalPath(l.path) === found)) group.imported = true;
      }
      return skill;
    },

    importAllDiscovered: async () => {
      const result: BatchImportResult = { imported: 0, skipped: 0, errors: [] };
      for (const group of lastScan ?? scan().skills) {
        const first = group.locations[0];
        if (group.imported || !first) {
          result.skipped += 1;
          continue;
        }
        try {
          await importOne(first.path);
          group.imported = true;
          result.imported += 1;
        } catch (error) {
          const message = batchFailureMessage(error, errorMessage(error));
          result.errors.push({ name: group.name, message });
        }
      }
      return result;
    },
  };
}
