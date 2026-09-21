import type { BackupApi } from "@loadout/shared";
import type { CoreContext } from "../context";
import { type AutoBackup, createAutoBackup } from "./auto";
import { type BackupDeps, createBackupEnv } from "./env";
import { createBackupOperations } from "./service";

export type { AutoBackup } from "./auto";
export type { BackupDeps, BackupHooks } from "./env";

export interface BackupService {
  api: BackupApi;
  /** Scheduler for the automatic backup. The host starts it and feeds it library changes. */
  auto: AutoBackup;
}

/** Git backup, skill-aware merge, snapshots, GitHub connect and the automatic backup. */
export function createBackupService(ctx: CoreContext, deps: BackupDeps): BackupService {
  const env = createBackupEnv(ctx, deps);
  const { api, target } = createBackupOperations(env, deps.fetchImpl);
  return { api, auto: createAutoBackup(target, ctx) };
}
