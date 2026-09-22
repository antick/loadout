import { ApiError } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { Library } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorWorkspace } from "@/features/editor/EditorWorkspace";
import { useSkill } from "@/hooks/queries/skills";

export interface SkillEditorPageProps {
  skillId: string;
  file: string | null;
  onOpenFile(path: string): void;
}

/** Route page: loads the skill, then hands over to the editor, or explains why it cannot. */
export function SkillEditorPage({ skillId, file, onOpenFile }: SkillEditorPageProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const skill = useSkill(skillId);

  if (skill.data) {
    return <EditorWorkspace skill={skill.data} requestedPath={file} onOpenFile={onOpenFile} />;
  }

  const crumbs = [{ label: t("nav.library"), to: "/library" as const }];
  if (skill.isError) {
    const gone = skill.error instanceof ApiError && skill.error.code === "NOT_FOUND";
    return (
      <>
        <PageHeader title={t("editor.title")} breadcrumbs={crumbs} />
        {gone ? (
          <EmptyState
            icon={Library}
            title={t("editor.missing.title")}
            description={t("editor.missing.description")}
            action={{
              label: t("editor.missing.back"),
              onClick: () => void navigate({ to: "/library" }),
            }}
            className="h-full"
          />
        ) : (
          <ErrorState error={skill.error} onRetry={() => void skill.refetch()} className="h-full" />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("editor.title")} breadcrumbs={crumbs} />
      <div className="flex h-full">
        <div className="flex w-56 flex-col gap-2 border-r p-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    </>
  );
}
