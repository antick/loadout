import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  type DeployItemOptions,
  type ItemDeploymentState,
  type ItemKind,
  type ItemPlaceRef,
  type ItemPreview,
  type ItemRemovalResult,
  exportItem,
} from "@loadout/shared";
import { notFound, targetConflict } from "../errors";
import { lstatOrNull, removePathSync, writeFileAtomic } from "../util/fs";
import { sha256Hex } from "../util/hash";
import { firstFreeName } from "../util/names";
import type { ItemDeploymentRecord, ItemDeploymentStore } from "./deployments";
import type { StoredItem } from "./library";
import type { ItemPlacement } from "./placement";

/** Added to a file Loadout replaced on request: kept beside it, read by no agent. */
const REPLACED_SUFFIX = ".loadout-old";

/** What is at a target path, by the hash of its text. */
type FileAtTarget = { kind: "absent" } | { kind: "file"; hash: string } | { kind: "other" };

function inspect(path: string): FileAtTarget {
  const stat = lstatOrNull(path);
  if (!stat) return { kind: "absent" };
  if (!stat.isFile()) return { kind: "other" };
  return { kind: "file", hash: sha256Hex(readFileSync(path, "utf8")) };
}

/** A deployment's state from the file there now and the library item's current hash. */
export function deploymentState(
  record: ItemDeploymentRecord,
  itemHash: string,
): ItemDeploymentState {
  const found = inspect(record.targetPath);
  if (found.kind === "absent") return "missing";
  if (found.kind !== "file" || found.hash !== record.writtenHash) return "edited";
  return record.sourceHash === itemHash ? "in_sync" : "outdated";
}

export interface ItemDeployer {
  preview(item: StoredItem, place: ItemPlaceRef): ItemPreview;
  deploy(item: StoredItem, place: ItemPlaceRef, options?: DeployItemOptions): void;
  undeploy(kind: ItemKind, name: string, place: ItemPlaceRef): ItemRemovalResult;
  /** Out of every place; files edited there stay. */
  undeployAll(kind: ItemKind, name: string): ItemRemovalResult;
  /**
   * Rewrite the files of an item that changed in the library. Files edited in the agent's folder,
   * and files that were deleted there, are left as they are.
   */
  refresh(item: StoredItem): number;
}

/**
 * Writes items into agent folders, converted. Ownership works like skill deployments: a file is
 * only replaced or removed while a record proves Loadout wrote it and it is unchanged since.
 */
export function createItemDeployer(deps: {
  placement: ItemPlacement;
  deployments: ItemDeploymentStore;
}): ItemDeployer {
  const { placement, deployments } = deps;

  const locate = (item: StoredItem, place: ItemPlaceRef) => {
    const resolved = placement.resolve(item.kind, place);
    const path = join(resolved.dir, placement.fileName(resolved.target, item.name));
    return { ...resolved, path };
  };

  /** True when the file there is one Loadout wrote and nobody changed. */
  const ownsUnchanged = (path: string, found: FileAtTarget): boolean =>
    found.kind === "file" &&
    deployments.atPath(path).some((record) => record.writtenHash === found.hash);

  const write = (item: StoredItem, place: ItemPlaceRef, path: string, content: string): void => {
    writeFileAtomic(path, content);
    deployments.upsert({
      kind: item.kind,
      name: item.name,
      agentKey: place.agentKey,
      projectId: place.projectId,
      targetPath: path,
      writtenHash: sha256Hex(content),
      sourceHash: item.hash,
      syncedAt: Date.now(),
    });
  };

  const removeRecorded = (record: ItemDeploymentRecord, result: ItemRemovalResult): void => {
    const found = inspect(record.targetPath);
    if (found.kind === "file" && found.hash === record.writtenHash) {
      removePathSync(record.targetPath);
      result.removed.push(record.targetPath);
    } else if (found.kind !== "absent") {
      result.kept.push(record.targetPath);
    }
    deployments.delete(record.kind, record.name, record.agentKey, record.projectId);
  };

  return {
    preview(item, place) {
      const { target, path } = locate(item, place);
      const converted = exportItem(item.kind, item.name, item.content, target.format);
      const found = inspect(path);
      return {
        ...place,
        path,
        content: converted.content,
        warnings: converted.warnings,
        occupied: found.kind !== "absent" && !ownsUnchanged(path, found),
      };
    },

    deploy(item, place, options = {}) {
      const { target, path } = locate(item, place);
      const converted = exportItem(item.kind, item.name, item.content, target.format);
      const found = inspect(path);
      if (found.kind !== "absent" && !ownsUnchanged(path, found)) {
        if (!options.replace || found.kind === "other") {
          const reason =
            found.kind === "other"
              ? "is a folder or a link, not a file"
              : deployments.atPath(path).length > 0
                ? "was changed there after Loadout wrote it"
                : "was not written by Loadout";
          throw targetConflict([{ path, reason }]);
        }
        const aside = firstFreeName(
          `${path}${REPLACED_SUFFIX}`,
          (candidate) => !existsSync(candidate),
        );
        renameSync(path, aside);
      }
      write(item, place, path, converted.content);
    },

    undeploy(kind, name, place) {
      const record = deployments.find(kind, name, place.agentKey, place.projectId);
      if (!record) throw notFound(`${name} is not deployed there.`);
      const result: ItemRemovalResult = { removed: [], kept: [] };
      removeRecorded(record, result);
      return result;
    },

    undeployAll(kind, name) {
      const result: ItemRemovalResult = { removed: [], kept: [] };
      for (const record of deployments.forItem(kind, name)) removeRecorded(record, result);
      return result;
    },

    refresh(item) {
      let written = 0;
      for (const record of deployments.forItem(item.kind, item.name)) {
        if (deploymentState(record, item.hash) !== "outdated") continue;
        const place = { agentKey: record.agentKey, projectId: record.projectId };
        let located: ReturnType<typeof locate>;
        try {
          located = locate(item, place);
        } catch {
          // The agent or the project is gone; the file stays as it was.
          continue;
        }
        // Only the file this record wrote is refreshed, never a new path it would now resolve to.
        if (located.path !== record.targetPath) continue;
        const converted = exportItem(item.kind, item.name, item.content, located.target.format);
        write(item, place, located.path, converted.content);
        written += 1;
      }
      return written;
    },
  };
}
