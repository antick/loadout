import { APP_NAME, type BrokenSkillFolder } from "@loadout/shared";
import { FolderX, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { InlineNotice } from "@/components/InlineNotice";
import { PathActions } from "@/components/PathActions";
import { Button } from "@/components/ui/button";
import { useDeleteBrokenFolder } from "@/hooks/mutations/workspace";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";
import { BROKEN_FOLDERS_SHOWN, brokenFolderProblem } from "./broken-folders";

export interface BrokenFoldersNoticeProps {
  agentKey: string;
  agentName: string;
  /** Undefined while loading; nothing shows until a broken folder is found. */
  folders: readonly BrokenSkillFolder[] | undefined;
}

/**
 * Folders in an agent's skills folder that the agent skips: no `SKILL.md`, or a link to nothing.
 * They never show up as skills, so without this the user cannot tell why a skill is missing.
 */
export function BrokenFoldersNotice({
  agentKey,
  agentName,
  folders,
}: BrokenFoldersNoticeProps): ReactNode {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!folders || folders.length === 0) return null;

  const shown = expanded ? folders : folders.slice(0, BROKEN_FOLDERS_SHOWN);
  const hidden = folders.length - shown.length;

  return (
    <InlineNotice tone="warning" icon={FolderX}>
      <p className="font-medium">{t("agents.broken.title", { count: folders.length })}</p>
      <p className="text-foreground/80">{t("agents.broken.description", { agent: agentName })}</p>
      <ul className="mt-2 flex flex-col divide-y divide-foreground/10">
        {shown.map((folder) => (
          <BrokenFolderRow key={folder.relativePath} agentKey={agentKey} folder={folder} />
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <Button
          size="xs"
          variant="link"
          className="mt-1 h-auto px-0 text-foreground/80"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t("agents.broken.showFewer") : t("agents.broken.showAll", { count: hidden })}
        </Button>
      ) : null}
    </InlineNotice>
  );
}

function BrokenFolderRow({
  agentKey,
  folder,
}: {
  agentKey: string;
  folder: BrokenSkillFolder;
}): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data: info } = useAppInfo();
  const deleteBroken = useDeleteBrokenFolder();
  const problem = brokenFolderProblem(folder);
  const home = info?.homeDir;
  const isLink = folder.reason === "dangling_link";

  const onDelete = async (): Promise<void> => {
    const ok = await confirm({
      title: t("agents.broken.confirm.title", { name: folder.dirName }),
      description: isLink
        ? t("agents.broken.confirm.linkDescription")
        : t("agents.broken.confirm.folderDescription", { path: compactHome(folder.path, home) }),
      items: isLink ? [compactHome(folder.path, home)] : folder.files,
      confirmLabel: t("agents.actions.deleteShort"),
      destructive: true,
    });
    if (!ok) return;
    deleteBroken.mutate({ agentKey, relativePath: folder.relativePath, name: folder.dirName });
  };

  return (
    <li className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-medium" title={folder.path}>
          {folder.relativePath}
        </p>
        <p data-selectable className="text-xs break-all text-foreground/70">
          {problem.key === "agents.broken.reason.danglingLink"
            ? t(problem.key, { target: compactHome(problem.target, home) })
            : problem.key === "agents.broken.reason.noDocument"
              ? t(problem.key, { count: problem.count })
              : t(problem.key)}
          {folder.linkTarget && !isLink
            ? ` · ${t("agents.broken.linkedTo", { target: compactHome(folder.linkTarget, home) })}`
            : null}
        </p>
        {folder.managed ? (
          <p className="text-xs text-foreground/70">
            {t("agents.broken.managedHint", { app: APP_NAME })}
          </p>
        ) : null}
      </div>
      <PathActions path={folder.path} />
      {folder.managed ? null : (
        <Button
          size="xs"
          variant="outline"
          disabled={deleteBroken.isPending}
          onClick={() => void onDelete()}
        >
          <Trash2 />
          {t("agents.broken.delete")}
        </Button>
      )}
    </li>
  );
}
