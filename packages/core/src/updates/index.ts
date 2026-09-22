export { type UpdatesService, type UpdatesServiceDeps, createUpdatesService } from "./service";
export {
  type AutoRunSummary,
  type AutoUpdateTarget,
  type AutoUpdater,
  AUTO_FIRST_TICK_MS,
  AUTO_SKILL_PAUSE_MS,
  AUTO_TICK_MS,
  createAutoUpdater,
} from "./auto";
export { type CheckOptions, type Checker, createChecker, isFresh } from "./check";
export { MAX_DIFF_TEXT_BYTES, diffTrees } from "./diff";
export type { LockMode } from "./locking";
export {
  LIBRARY_LOCATION,
  approvalToken,
  isApproved,
  listRemovedPaths,
  listReplacedEdits,
  sortRemovals,
} from "./removals";
export { type RemoteTarget, isRemoteSource, remoteTargetOf, sourceLabel } from "./source";
export { type UpdateOptions, type Updater, createUpdater, updateCancelKey } from "./update";
