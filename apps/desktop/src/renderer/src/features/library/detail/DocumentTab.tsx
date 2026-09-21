import type { Skill } from "@loadout/shared";
import { File, FileText, Folder } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { MarkdownView } from "@/components/MarkdownView";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkillDocument } from "@/hooks/queries/skills";

/** A top-level entry without a dot is shown as a folder; the backend sends names only. */
function looksLikeFolder(name: string): boolean {
  return !name.includes(".");
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
      <PageSection title={t("library.document.files", { count: files.length })}>
        <ul className="flex flex-wrap gap-1.5">
          {files.map((name) => {
            const Icon = name === filename ? FileText : looksLikeFolder(name) ? Folder : File;
            return (
              <li
                key={name}
                data-selectable
                className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-muted/40 px-2 font-mono text-xs data-[main=true]:border-primary/40 data-[main=true]:text-foreground"
                data-main={name === filename}
              >
                <Icon className="size-3 text-muted-foreground" />
                {name}
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
