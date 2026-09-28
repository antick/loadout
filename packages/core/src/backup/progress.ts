import type { BackupStage } from "@loadout/shared";
import type { BackupEnv } from "./env";

/** Tell the UI where a sync or its review is; null once it is over. */
export function reportStage(env: BackupEnv, stage: BackupStage | null): void {
  env.ctx.emit("backup:progress", { stage });
}

/** Run `work`, and report the end whatever happens. */
export async function withStages<T>(env: BackupEnv, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } finally {
    reportStage(env, null);
  }
}
