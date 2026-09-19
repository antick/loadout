import type { Skill } from "@skillboard/shared";
import { CloudOff, GitCompareArrows } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTabs } from "@/components/DocumentTabs";
import { EmptyState } from "@/components/EmptyState";
import { FileDiffList } from "@/components/FileDiffList";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSourceDiff, useSourceDocument } from "@/hooks/queries/library";
import { useSkillDocument } from "@/hooks/queries/skills";
import { errorMessage } from "@/lib/toast";

/** Characters of a revision shown next to the source name. */
const REVISION_DISPLAY_LENGTH = 10;

/**
 * Library copy against its source, fetched only when this tab is opened: changed files, then the
 * main document as Local / Diff / Source. A source that cannot be reached is a calm empty state.
 */
export function CompareTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const hasSource = Boolean(skill.sourceRef ?? skill.sourceUrl);
  const diff = useSourceDiff(skill.id, hasSource);
  const sourceDocument = useSourceDocument(skill.id, hasSource);
  const libraryDocument = useSkillDocument(skill.id);

  if (!hasSource) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title={t("library.compare.noSourceTitle")}
        description={t("library.compare.noSourceDescription")}
      />
    );
  }

  if (diff.isError) {
    return (
      <EmptyState
        icon={CloudOff}
        title={t("library.compare.unavailableTitle")}
        description={errorMessage(diff.error, "library.compare.unavailableDescription")}
      >
        <Button variant="outline" size="sm" onClick={() => void diff.refetch()}>
          {t("common.retry")}
        </Button>
      </EmptyState>
    );
  }

  const revision = diff.data?.revision?.slice(0, REVISION_DISPLAY_LENGTH);

  return (
    <div className="flex flex-col gap-6">
      <PageSection
        title={t("library.compare.files")}
        description={
          diff.data
            ? t("library.compare.against", {
                source: diff.data.sourceLabel,
                revision: revision ?? t("library.source.none"),
              })
            : t("library.compare.loading")
        }
      >
        {diff.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <FileDiffList entries={diff.data.entries} />
        )}
      </PageSection>

      <PageSection title={t("library.compare.document")}>
        <DocumentTabs
          local={libraryDocument.isError ? null : libraryDocument.data?.content}
          library={sourceDocument.isError ? null : sourceDocument.data?.content}
          localLabel={t("library.compare.local")}
          libraryLabel={t("library.compare.source")}
          defaultTab="diff"
          reverseDiff
        />
      </PageSection>
    </div>
  );
}
