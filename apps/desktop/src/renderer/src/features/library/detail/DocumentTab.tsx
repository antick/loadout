import { SKILL_MARKER_FILES, canFixFrontmatter, hasSkillErrors, type Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { File, FileText, Folder, PencilLine, WandSparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { MarkdownView } from "@/components/MarkdownView";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { SkillIssueList } from "@/components/SkillIssueList";
import { SkillTraitList } from "@/components/SkillTraitBadges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkillDocument } from "@/hooks/queries/skills";
import { cn } from "@/lib/utils";
import { FixFrontmatterDialog } from "./FixFrontmatterDialog";
import { NoteSection } from "./NoteSection";

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
  const [fixing, setFixing] = useState(false);

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
  const markerFile = SKILL_MARKER_FILES.some((marker) => marker === filename);
  const fixable = markerFile && canFixFrontmatter(skill.issues);
  return (
    <div className="flex flex-col gap-6">
      {skill.issues.length > 0 ? (
        <PageSection
          title={t("checks.title")}
          actions={
            <div className="flex items-center gap-1.5">
              {fixable ? (
                <Button variant="outline" size="xs" onClick={() => setFixing(true)}>
                  <WandSparkles />
                  {t("checks.fixFrontmatter.button")}
                </Button>
              ) : null}
              <Button asChild variant="outline" size="xs">
                <Link to="/library/$skillId/edit" params={{ skillId: skill.id }}>
                  <PencilLine />
                  {t("checks.fix")}
                </Link>
              </Button>
            </div>
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
          {fixable ? (
            <FixFrontmatterDialog
              skill={skill}
              path={filename}
              open={fixing}
              onOpenChange={setFixing}
            />
          ) : null}
        </PageSection>
      ) : null}
      <NoteSection skill={skill} />
      {skill.traits.length > 0 ? (
        <PageSection title={t("traits.sectionTitle")}>
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
            <SkillTraitList traits={skill.traits} />
            <p className="text-xs text-muted-foreground">{t("traits.sectionHint")}</p>
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
