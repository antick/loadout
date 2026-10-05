import type { SkillSourceKind } from "@loadout/shared";
import { FileArchive, GitBranch, Link2, type LucideIcon, Package } from "lucide-react";

/** The icon of a skill source by what it is: a repository, an archive, a link or a registry. */
export const SOURCE_KIND_ICONS: Record<SkillSourceKind, LucideIcon> = {
  repository: GitBranch,
  archive: FileArchive,
  link: Link2,
  registry: Package,
};
