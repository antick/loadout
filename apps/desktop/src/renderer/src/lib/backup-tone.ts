import type { BackupStatus } from "@loadout/shared";
import type { StatusTone } from "@/components/StatusBadge";

/** Backup health as a tone: grey = not set up, amber = changes waiting, red = broken, green = synced. */
export function backupTone(status: BackupStatus | undefined): StatusTone | null {
  if (!status) return null;
  if (!status.isRepo || !status.remoteUrl) return "neutral";
  if (status.upstreamHealth !== "healthy" || !status.gitAvailable) return "danger";
  if (status.hasChanges || status.ahead > 0 || status.behind > 0) return "warning";
  return "success";
}
