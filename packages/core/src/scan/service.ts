import { join, resolve } from "node:path";
import type {
  BatchImportResult,
  DiscoveredLocation,
  DiscoveredSkill,
  ScanResult,
  Skill,
  SourceType,
} from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage, invalid } from "../errors";
import type { InstallIntoLibrary } from "../install/library";
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
}

export interface ScanService {
  scanLocal(): Promise<ScanResult>;
  importDiscovered(path: string, name?: string): Promise<Skill>;
  importAllDiscovered(): Promise<BatchImportResult>;
}

/** Depth 1 = direct children only. */
const FLAT_DEPTH = 1;
/** Source types whose `sourceRef` is a folder on this machine. */
const PATH_SOURCE_TYPES: ReadonlySet<SourceType> = new Set(["local", "import"]);

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

  /** Folders an agent reads, with how deep to look in each. Extra folders are always flat. */
  function scanRoots(agent: ResolvedAgent): { dir: string; maxDepth: number | undefined }[] {
    const main = { dir: agent.skillsDir, maxDepth: agent.recursiveScan ? undefined : FLAT_DEPTH };
    const extras = agent.extraScanDirs.map((dir) => ({ dir, maxDepth: FLAT_DEPTH }));
    return [main, ...extras].filter((root) => isDirectory(root.dir));
  }

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

    const agents = registry
      .list()
      .filter((agent) => agent.installed || agent.extraScanDirs.length > 0);
    const groups = new Map<string, DiscoveredSkill>();
    const paths = new Set<string>();

    for (const agent of agents) {
      for (const root of scanRoots(agent)) {
        // The root is a container, never a skill itself, so list its children and search those.
        for (const entry of readDirSafe(root.dir)) {
          const child = join(root.dir, entry.name);
          if (!isDirectory(child)) continue;
          const depth = root.maxDepth === undefined ? undefined : root.maxDepth - 1;
          for (const path of findSkillDirs(child, { maxDepth: depth, libraryDir: library })) {
            if (!isDirectory(path) || isInside(library, canonicalPath(path))) continue;
            if (ownTargets.has(resolve(path)) || ownTargets.has(targetIdentity(path))) continue;
            record(groups, paths, { agentKey: agent.key, path }, bySourcePath, libraryHashes);
          }
        }
      }
    }

    lastScan = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { agentsScanned: agents.length, skillsFound: paths.size, skills: lastScan };
  }

  async function importOne(path: string, name?: string): Promise<Skill> {
    const source = normalizeAbsolutePath(path, "Skill path");
    if (!isSkillDir(source)) throw invalid(`No SKILL.md found in ${source}`);
    // Copy only: the original folder stays where it is and is neither deployed nor adopted.
    return install({
      sourceDir: source,
      name,
      keepExisting: true,
      activityKind: "import",
      record: { sourceType: "import", sourceRef: source, updateStatus: "local_only" },
    });
  }

  return {
    scanLocal: async () => scan(),

    importDiscovered: async (path, name) => {
      const skill = await importOne(path, name);
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
          result.errors.push({ name: group.name, message: errorMessage(error) });
        }
      }
      return result;
    },
  };
}
