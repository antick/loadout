import type { SkillDuplicate } from "@loadout/shared";
import { CopyPlus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { PathText } from "@/components/PathText";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";

/** Folder that holds a copy, for "also reads ~/.agents/skills". */
function parentOf(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : path;
}

type Translate = ReturnType<typeof useTranslation>["t"];

/**
 * One sentence saying where the other copy is; the badge's tooltip and the notice share it.
 * `homeDir` shortens the folder to `~/…`, as paths are shown everywhere else.
 */
export function describeDuplicate(
  t: Translate,
  duplicate: SkillDuplicate,
  homeDir: string | undefined,
): string {
  return t(`localSkills.duplicates.${duplicate.where}`, {
    agent: duplicate.agentDisplayName,
    folder: compactHome(parentOf(duplicate.path), homeDir),
  });
}

/**
 * Other copies the same agent loads: from a shared folder it also reads, or, for a project skill,
 * from its global folder. States the fact and where; which copy wins is up to the agent.
 */
export function DuplicatesNotice({
  duplicates,
}: {
  duplicates: readonly SkillDuplicate[];
}): ReactNode {
  const { t } = useTranslation();
  const { data: info } = useAppInfo();
  if (duplicates.length === 0) return null;
  return (
    <InlineNotice tone="warning" icon={CopyPlus}>
      <ul className="flex flex-col gap-2">
        {duplicates.map((duplicate) => (
          <li key={`${duplicate.agentKey}:${duplicate.path}`} className="flex flex-col gap-0.5">
            <span>{describeDuplicate(t, duplicate, info?.homeDir)}</span>
            <PathText path={duplicate.path} className="text-xs" />
          </li>
        ))}
      </ul>
    </InlineNotice>
  );
}
