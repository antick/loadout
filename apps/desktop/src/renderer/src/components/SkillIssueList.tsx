import type { SkillIssue } from "@loadout/shared";
import { CircleX, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** One problem in the app's words; the core's English `message` is for the CLI. */
export function useIssueText(): (issue: SkillIssue) => string {
  const { t } = useTranslation();
  return (issue) =>
    t(`checks.code.${issue.code}`, { ...issue.params, defaultValue: issue.message });
}

export interface SkillIssueListProps {
  issues: readonly SkillIssue[];
  /** Given, an issue's line is a button that takes the editor there; otherwise plain text. */
  onJumpToLine?: (line: number) => void;
  className?: string;
}

/** Format problems of a skill, errors first, each with its severity. */
export function SkillIssueList({
  issues,
  onJumpToLine,
  className,
}: SkillIssueListProps): ReactNode {
  const { t } = useTranslation();
  const textOf = useIssueText();
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {issues.map((issue) => {
        const error = issue.severity === "error";
        const Icon = error ? CircleX : TriangleAlert;
        return (
          <li
            key={`${issue.code}:${JSON.stringify(issue.params)}`}
            data-selectable
            className="flex items-start gap-2 text-sm"
          >
            <Icon
              aria-label={t(`checks.severity.${issue.severity}`)}
              className={cn("mt-0.5 size-4 shrink-0", error ? "text-danger" : "text-warning")}
            />
            <span className="min-w-0 break-words">
              {textOf(issue)}
              {issue.line === undefined ? null : onJumpToLine ? (
                <button
                  type="button"
                  onClick={() => issue.line !== undefined && onJumpToLine(issue.line)}
                  aria-label={t("checks.goToLine", { line: issue.line })}
                  className="ml-1.5 rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t("checks.line", { line: issue.line })}
                </button>
              ) : (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {t("checks.line", { line: issue.line })}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
