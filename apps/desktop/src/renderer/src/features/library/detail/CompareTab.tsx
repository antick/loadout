import { formatRevision } from "@loadout/shared";
import type { Skill } from "@loadout/shared";
import { CloudOff, GitCompareArrows } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTabs } from "@/components/DocumentTabs";
import { EmptyState } from "@/components/EmptyState";
import { FileDiffList } from "@/components/FileDiffList";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSourceComparison } from "@/features/library/detail/skill-queries";
import { useSkillDocument } from "@/hooks/queries/skills";
import { errorMessage } from "@/lib/toast";

/** Characters of a revision shown next to the source name. */

/**
 * Library copy against its source, fetched only when this tab is opened: changed files, then the
 * main document as Local / Diff / Source. A source that cannot be reached is a calm empty state.
 */
export function CompareTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const hasSource = Boolean(skill.sourceRef ?? skill.sourceUrl);
  const comparison = useSourceComparison(skill, hasSource);
  const diff = comparison.data?.diff;
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

  if (comparison.isError) {
    return (
      <EmptyState
        icon={CloudOff}
        title={t("library.compare.unavailableTitle")}
        description={errorMessage(comparison.error, "library.compare.unavailableDescription")}
      >
        <Button variant="outline" size="sm" onClick={() => void comparison.refetch()}>
          {t("common.retry")}
        </Button>
      </EmptyState>
    );
  }

  const revision = diff?.revision ? formatRevision(diff.revision) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageSection
        title={t("library.compare.files")}
        description={
          diff
            ? t("library.compare.against", {
                source: diff.sourceLabel,
                revision: revision ?? t("library.source.none"),
              })
            : t("library.compare.loading")
        }
      >
        {!diff ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <FileDiffList entries={diff.entries} />
        )}
      </PageSection>

      <PageSection title={t("library.compare.document")}>
        <DocumentTabs
          local={libraryDocument.isError ? null : libraryDocument.data?.content}
          library={comparison.data?.document.content}
          localLabel={t("library.compare.local")}
          libraryLabel={t("library.compare.source")}
          defaultTab="diff"
          reverseDiff
        />
      </PageSection>
    </div>
  );
}
