import type { SourceType } from "@loadout/shared";
import { FolderInput, GitBranch, HardDrive, Link2, type LucideIcon, Store } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";

const SOURCE_ICONS: Record<SourceType, LucideIcon> = {
  local: HardDrive,
  import: FolderInput,
  git: GitBranch,
  marketplace: Store,
  url: Link2,
};

/** Where a library skill came from: local, import, git, marketplace or an archive link. */
export function SourceBadge({
  source,
  compact,
}: {
  source: SourceType;
  compact?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const Icon = SOURCE_ICONS[source];
  return (
    <StatusBadge tone="neutral" icon={<Icon />} label={t(`source.${source}`)} compact={compact} />
  );
}
