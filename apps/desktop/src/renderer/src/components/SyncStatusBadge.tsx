import type { SyncStatus } from "@skillboard/shared";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleDashed,
  GitCompareArrows,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";

/** Tone and icon per sync status; exported so lists can colour counts the same way. */
export const SYNC_STATUS_META: Record<SyncStatus, { tone: StatusTone; icon: LucideIcon }> = {
  in_sync: { tone: "success", icon: Check },
  local_only: { tone: "neutral", icon: CircleDashed },
  local_newer: { tone: "warning", icon: ArrowUpFromLine },
  library_newer: { tone: "info", icon: ArrowDownToLine },
  diverged: { tone: "danger", icon: GitCompareArrows },
};

/** How a skill folder on disk compares with its library skill. */
export function SyncStatusBadge({
  status,
  compact,
}: {
  status: SyncStatus;
  compact?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const { tone, icon: Icon } = SYNC_STATUS_META[status];
  return (
    <StatusBadge tone={tone} icon={<Icon />} label={t(`syncStatus.${status}`)} compact={compact} />
  );
}
