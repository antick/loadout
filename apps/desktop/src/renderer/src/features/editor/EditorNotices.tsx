import type { Skill } from "@loadout/shared";
import { FileWarning, GitBranch, History, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import type { FrontmatterProblem } from "@/features/editor/frontmatter-checks";
import { hasTrackedSource, sourceLabelOf } from "@/lib/skill-source";

export interface EditorNoticesProps {
  skill: Skill;
  path: string;
  /** The open file is gone from disk. */
  deleted: boolean;
  /** The file changed on disk and differs from the edit. */
  diskChanged: boolean;
  /** Unsaved text came back from an earlier session. */
  restored: boolean;
  problems: readonly FrontmatterProblem[];
  onCompare(): void;
  onKeepMine(): void;
  onReload(): void;
  onDiscardRestored(): void;
}

/** The notes above the editor, most urgent first. Each says what happened and what to do. */
export function EditorNotices({
  skill,
  path,
  deleted,
  diskChanged,
  restored,
  problems,
  onCompare,
  onKeepMine,
  onReload,
  onDiscardRestored,
}: EditorNoticesProps): ReactNode {
  const { t } = useTranslation();
  const notices: ReactNode[] = [];

  if (deleted) {
    notices.push(
      <InlineNotice key="deleted" tone="danger" icon={FileWarning}>
        {t("editor.notice.deleted", { path })}
      </InlineNotice>,
    );
  } else if (diskChanged) {
    notices.push(
      <InlineNotice
        key="disk"
        tone="warning"
        icon={TriangleAlert}
        actions={
          <>
            <Button variant="ghost" size="xs" onClick={onCompare}>
              {t("editor.notice.compare")}
            </Button>
            <Button variant="ghost" size="xs" onClick={onKeepMine}>
              {t("editor.notice.keepMine")}
            </Button>
            <Button variant="outline" size="xs" onClick={onReload}>
              {t("editor.notice.reload")}
            </Button>
          </>
        }
      >
        {t("editor.notice.diskChanged", { path })}
      </InlineNotice>,
    );
  }

  if (restored && !diskChanged && !deleted) {
    notices.push(
      <InlineNotice
        key="restored"
        tone="info"
        icon={History}
        actions={
          <Button variant="ghost" size="xs" onClick={onDiscardRestored}>
            {t("editor.notice.discard")}
          </Button>
        }
      >
        {t("editor.notice.restored")}
      </InlineNotice>,
    );
  }

  if (problems.length > 0) {
    notices.push(
      <InlineNotice key="frontmatter" tone="warning" icon={TriangleAlert}>
        {problems.includes("missing")
          ? t("editor.notice.noFrontmatter")
          : t("editor.notice.frontmatterMissing", {
              keys: problems.map((problem) => `“${problem}”`).join(t("editor.notice.and")),
            })}
      </InlineNotice>,
    );
  }

  if (hasTrackedSource(skill)) {
    notices.push(
      <InlineNotice key="source" tone="neutral" icon={GitBranch}>
        {t("editor.notice.tracked", { source: sourceLabelOf(skill) })}
      </InlineNotice>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="flex flex-col gap-2 border-b px-4 py-3">{notices}</div>;
}
