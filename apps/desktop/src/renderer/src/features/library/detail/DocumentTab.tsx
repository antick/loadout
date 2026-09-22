import { hasSkillErrors, type Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { File, FileText, Folder, PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { MarkdownView } from "@/components/MarkdownView";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { SkillIssueList } from "@/components/SkillIssueList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkillDocument } from "@/hooks/queries/skills";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
  "inline-flex h-6 items-center rounded-md border bg-muted/40 font-mono text-xs data-[main=true]:border-primary/40 data-[main=true]:text-foreground";

/** Folders come back with a trailing `/`. */
function looksLikeFolder(name: string): boolean {
  return name.endsWith("/");
}

/** The skill's main document, rendered, with the top-level files of its folder. */
export function DocumentTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const document = useSkillDocument(skill.id);

  if (document.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (document.isError) {
    return <ErrorState error={document.error} onRetry={() => void document.refetch()} />;
  }

  const { filename, content, files, path } = document.data;
  return (
    <div className="flex flex-col gap-6">
      {skill.issues.length > 0 ? (
        <PageSection
          title={t("checks.title")}
          actions={
            <Button asChild variant="outline" size="xs">
              <Link to="/library/$skillId/edit" params={{ skillId: skill.id }}>
                <PencilLine />
                {t("checks.fix")}
              </Link>
            </Button>
          }
        >
          <div
            className={cn(
              "rounded-lg border px-3 py-2.5",
              hasSkillErrors(skill.issues)
                ? "border-danger/30 bg-danger/5"
                : "border-warning/30 bg-warning/5",
            )}
          >
            <SkillIssueList issues={skill.issues} />
          </div>
        </PageSection>
      ) : null}
      <PageSection
        title={t("library.document.files", { count: files.length })}
        actions={
          <Button asChild variant="ghost" size="xs">
            <Link to="/library/$skillId/edit" params={{ skillId: skill.id }}>
              <PencilLine />
              {t("editor.open")}
            </Link>
          </Button>
        }
      >
        <ul className="flex flex-wrap gap-1.5">
          {files.map((name) => {
            const folder = looksLikeFolder(name);
            const Icon = name === filename ? FileText : folder ? Folder : File;
            const chip = (
              <>
                <Icon className="size-3 text-muted-foreground" />
                {name}
              </>
            );
            return (
              <li key={name} data-main={name === filename} className={CHIP_CLASS}>
                {folder ? (
                  <span data-selectable className="inline-flex items-center gap-1.5 px-2">
                    {chip}
                  </span>
                ) : (
                  // Files open in the editor; the editor says when one is not a text file.
                  <Link
                    to="/library/$skillId/edit"
                    params={{ skillId: skill.id }}
                    search={{ file: name }}
                    title={t("editor.openFile", { path: name })}
                    className="inline-flex h-full items-center gap-1.5 rounded-md px-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {chip}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <PathText path={path} />
      </PageSection>
      <article className="rounded-lg border bg-card p-4">
        <MarkdownView content={content} />
      </article>
    </div>
  );
}
