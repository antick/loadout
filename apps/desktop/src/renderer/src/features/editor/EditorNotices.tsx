import { hasSkillErrors, type Skill, type SkillCopy, type SkillIssue } from "@loadout/shared";
import { Copy, FileWarning, GitBranch, History, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { SkillIssueList } from "@/components/SkillIssueList";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { hasTrackedSource, sourceLabelOf } from "@/lib/skill-source";

export interface EditorNoticesProps {
  /** Set when a library skill is edited. */
  librarySkill: Skill | null;
  /** Other copies of a project skill in other agents' folders. */
  otherCopies: readonly SkillCopy[];
  carryToCopies: boolean;
  onCarryToCopies(carry: boolean): void;
  path: string;
  /** The open file is gone from disk. */
  deleted: boolean;
  /** The file changed on disk and differs from the edit. */
  diskChanged: boolean;
  /** Unsaved text came back from an earlier session. */
  restored: boolean;
  /** Format problems of the text on screen (SKILL.md only), errors first. */
  problems: readonly SkillIssue[];
  /** Take the editor to a problem's line. */
  onJumpToLine(line: number): void;
  onCompare(): void;
  onKeepMine(): void;
  onReload(): void;
  onDiscardRestored(): void;
}

const CARRY_SWITCH_ID = "editor-carry-to-copies";

/** The notes above the editor, most urgent first. Each says what happened and what to do. */
export function EditorNotices({
  librarySkill,
  otherCopies,
  carryToCopies,
  onCarryToCopies,
  path,
  deleted,
  diskChanged,
  restored,
  problems,
  onJumpToLine,
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
    const errors = hasSkillErrors(problems);
    notices.push(
      <InlineNotice
        key="checks"
        tone={errors ? "danger" : "warning"}
        icon={errors ? FileWarning : TriangleAlert}
      >
        <SkillIssueList issues={problems} onJumpToLine={onJumpToLine} className="gap-1" />
      </InlineNotice>,
    );
  }

  if (otherCopies.length > 0) {
    notices.push(
      <InlineNotice
        key="copies"
        tone="neutral"
        icon={Copy}
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor={CARRY_SWITCH_ID} className="text-xs font-normal">
              {t("editor.notice.carry")}
            </Label>
            <Switch
              id={CARRY_SWITCH_ID}
              size="sm"
              checked={carryToCopies}
              onCheckedChange={onCarryToCopies}
            />
          </div>
        }
      >
        {t("editor.notice.copies", {
          count: otherCopies.length,
          agents: otherCopies.map((copy) => copy.agentName).join(", "),
        })}
      </InlineNotice>,
    );
  }

  if (librarySkill && hasTrackedSource(librarySkill)) {
    notices.push(
      <InlineNotice key="source" tone="neutral" icon={GitBranch}>
        {t("editor.notice.tracked", { source: sourceLabelOf(librarySkill) })}
      </InlineNotice>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="flex flex-col gap-2 border-b px-4 py-3">{notices}</div>;
}
