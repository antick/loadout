import type { BackupStage } from "@loadout/shared";
import { useState } from "react";
import { useAppEvent } from "@/lib/events";

/** Where the running sync or review is, manual or automatic; null when none runs. */
export function useBackupStage(): BackupStage | null {
  const [stage, setStage] = useState<BackupStage | null>(null);
  useAppEvent("backup:progress", (progress) => setStage(progress.stage));
  return stage;
}
