import type { Skill, SourceType } from "@loadout/shared";
import {
  FolderInput,
  GitBranch,
  HardDrive,
  Link2,
  type LucideIcon,
  Package,
  Store,
  UserPen,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";

const SOURCE_ICONS: Record<SourceType, LucideIcon> = {
  local: HardDrive,
  import: FolderInput,
  git: GitBranch,
  marketplace: Store,
  clawhub: Package,
  url: Link2,
};

/**
 * Where a library skill came from: local, import, git, marketplace or an archive link, or "Mine"
 * for a skill the user marked as their own.
 */
export function SourceBadge({
  skill,
  compact,
}: {
  skill: Pick<Skill, "sourceType" | "authored">;
  compact?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const Icon = skill.authored ? UserPen : SOURCE_ICONS[skill.sourceType];
  const label = skill.authored ? t("origin.badge") : t(`source.${skill.sourceType}`);
  return <StatusBadge tone="neutral" icon={<Icon />} label={label} compact={compact} />;
}
