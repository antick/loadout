import type { UpdateStatus } from "@skillboard/shared";
import {
  ArrowUpCircle,
  Check,
  CircleAlert,
  CircleHelp,
  type LucideIcon,
  Unlink,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Spinner } from "@/components/ui/spinner";

const UPDATE_STATUS_META: Record<UpdateStatus, { tone: StatusTone; icon: LucideIcon | null }> = {
  unknown: { tone: "neutral", icon: CircleHelp },
  checking: { tone: "neutral", icon: null },
  up_to_date: { tone: "success", icon: Check },
  update_available: { tone: "info", icon: ArrowUpCircle },
  error: { tone: "danger", icon: CircleAlert },
  local_only: { tone: "neutral", icon: null },
  source_missing: { tone: "warning", icon: Unlink },
};

/** Statuses worth a badge on a dense card; the rest only show when `showAll` is set. */
const NOTEWORTHY: ReadonlySet<UpdateStatus> = new Set([
  "checking",
  "update_available",
  "error",
  "source_missing",
]);

export interface UpdateStatusBadgeProps {
  status: UpdateStatus;
  /** Also render quiet states such as "up to date". */
  showAll?: boolean;
  compact?: boolean;
}

/** Whether a skill's upstream source has something newer. */
export function UpdateStatusBadge({ status, showAll, compact }: UpdateStatusBadgeProps): ReactNode {
  const { t } = useTranslation();
  if (!showAll && !NOTEWORTHY.has(status)) return null;
  const { tone, icon: Icon } = UPDATE_STATUS_META[status];
  const icon = status === "checking" ? <Spinner /> : Icon ? <Icon /> : undefined;
  return (
    <StatusBadge tone={tone} icon={icon} label={t(`updateStatus.${status}`)} compact={compact} />
  );
}
