import { ApiError, type SkillLocation } from "@loadout/shared";
import { type LinkProps, useNavigate } from "@tanstack/react-router";
import { FileX } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { type PageCrumb, PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorWorkspace } from "@/features/editor/EditorWorkspace";
import { useEditTarget } from "@/hooks/queries/editor";
import { useSkill } from "@/hooks/queries/skills";
import { locationKey } from "@/lib/skill-location";

export interface SkillEditorPageProps {
  location: SkillLocation;
  file: string | null;
  onOpenFile(path: string): void;
  /** Parent pages in the title bar, e.g. Projects › my-app. */
  crumbs: readonly PageCrumb[];
  /** Where Done and "go back" lead. */
  doneLink: LinkProps;
  /** Title while loading or when the file is gone; "Edit skill" by default. */
  title?: string;
}

/** Route page: finds the skill, then hands over to the editor, or explains why it cannot. */
export function SkillEditorPage({
  location,
  file,
  onOpenFile,
  crumbs,
  doneLink,
  title,
}: SkillEditorPageProps): ReactNode {
  const { t } = useTranslation();
  const pageTitle = title ?? t("editor.title");
  const navigate = useNavigate();
  const target = useEditTarget(location);
  const resolved = target.data?.location;
  const librarySkill = useSkill(resolved?.kind === "library" ? resolved.skillId : null);

  if (target.data && (resolved?.kind !== "library" || librarySkill.data)) {
    return (
      <EditorWorkspace
        // A fresh editor per place, so open files and drafts never carry over.
        key={locationKey(target.data.location)}
        target={target.data}
        librarySkill={librarySkill.data ?? null}
        crumbs={crumbs}
        doneLink={doneLink}
        requestedPath={file}
        onOpenFile={onOpenFile}
      />
    );
  }

  const error = target.error ?? librarySkill.error;
  if (error) {
    const gone = error instanceof ApiError && error.code === "NOT_FOUND";
    return (
      <>
        <PageHeader title={pageTitle} breadcrumbs={crumbs} />
        {gone ? (
          <EmptyState
            icon={FileX}
            title={t("editor.missing.title")}
            description={t("editor.missing.description")}
            action={{ label: t("editor.missing.back"), onClick: () => void navigate(doneLink) }}
            className="h-full"
          />
        ) : (
          <ErrorState error={error} onRetry={() => void target.refetch()} className="h-full" />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={pageTitle} breadcrumbs={crumbs} />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </>
  );
}
