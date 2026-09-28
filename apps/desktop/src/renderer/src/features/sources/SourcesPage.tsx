import {
  type Skill,
  type SkillSource,
  groupSkillSources,
  skillsWithoutSource,
} from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { Download, GitFork, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { CardGridSkeleton } from "@/components/LinkCard";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { GitPreviewDialog } from "@/features/install/GitPreviewDialog";
import { useDeleteSkills } from "@/features/library/use-delete-skills";
import { SourceCard } from "@/features/sources/SourceCard";
import { useBrowseSource } from "@/features/sources/use-browse-source";
import { useCopyText } from "@/hooks/mutations/app";
import { useCheckSkills, useUpdateSkills } from "@/hooks/mutations/library";
import { useCheckSources, useDismissSourceNews } from "@/hooks/mutations/sources";
import { useSourceNews } from "@/hooks/queries/sources";
import { useSkills } from "@/hooks/queries/skills";

/** Cards of sources, one column when narrow, two when there is room. */
const SOURCE_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(24rem,1fr))] gap-3";

/**
 * Where the library's skills came from, one card per repository, archive or link: what came
 * from it, whether it has updates, and "find new skills" to see what else it offers now.
 */
export function SourcesPage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const skills = useSkills();
  const browse = useBrowseSource();
  const check = useCheckSkills();
  const update = useUpdateSkills();
  const copy = useCopyText();
  const deleteSkills = useDeleteSkills();
  const news = useSourceNews();
  const checkSources = useCheckSources();
  const dismissNews = useDismissSourceNews();
  const newByKey = useMemo(
    () => new Map((news.data ?? []).map((entry) => [entry.sourceKey, entry.skills])),
    [news.data],
  );

  const all = skills.data;
  const sources = useMemo(() => groupSkillSources(all ?? []), [all]);
  const byId = useMemo(() => new Map((all ?? []).map((skill) => [skill.id, skill])), [all]);
  const skillsOf = (source: SkillSource): Skill[] =>
    source.skillIds.flatMap((id) => {
      const skill = byId.get(id);
      return skill ? [skill] : [];
    });
  const loose = all ? skillsWithoutSource(all) : 0;
  const allLabel = t("sources.allSources");
  const checkingAll = check.isPending && check.variables?.label === allLabel;

  const checkEverything = (): void => {
    check.mutate({ skillIds: sources.flatMap((source) => source.skillIds), label: allLabel });
    checkSources.mutate(undefined);
  };

  return (
    <div className="flex min-h-full flex-col gap-6 px-6 py-5">
      <PageHeader
        title={t("sources.title")}
        subtitle={t("sources.subtitle")}
        actions={
          sources.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={checkEverything}
              disabled={check.isPending}
            >
              {checkingAll ? <Spinner /> : <RefreshCw />}
              {t("sources.checkAll")}
            </Button>
          ) : undefined
        }
      />
      {skills.isPending ? (
        <CardGridSkeleton />
      ) : skills.error ? (
        <ErrorState error={skills.error} onRetry={() => void skills.refetch()} className="flex-1" />
      ) : sources.length === 0 ? (
        <EmptyState
          icon={GitFork}
          title={t("sources.emptyTitle")}
          description={t("sources.emptyDescription")}
          action={{
            label: t("sources.install"),
            icon: Download,
            onClick: () => void navigate({ to: "/install", search: { tab: "git" } }),
          }}
          className="flex-1"
        />
      ) : (
        <div className={SOURCE_GRID_CLASS}>
          {sources.map((source) => {
            const own = skillsOf(source);
            return (
              <SourceCard
                key={source.key}
                source={source}
                skills={own}
                browsing={browse.busyKey === source.key}
                checking={check.isPending && check.variables?.label === source.label}
                onBrowse={() => void browse.browse(source)}
                onCheck={() => {
                  check.mutate({ skillIds: source.skillIds, label: source.label });
                  if (source.kind === "repository") checkSources.mutate([source.key]);
                }}
                onUpdate={() =>
                  update.mutate(
                    own.filter((s) => s.updateStatus === "update_available").map((s) => s.id),
                  )
                }
                onShowInLibrary={() =>
                  void navigate({ to: "/library", search: { q: source.location } })
                }
                onCopyLocation={() => copy.mutate(source.location)}
                onRemove={() => void deleteSkills(own)}
                newSkills={newByKey.get(source.key) ?? []}
                onAddNew={() =>
                  void browse.browse(
                    source,
                    (newByKey.get(source.key) ?? []).map((skill) => skill.name),
                  )
                }
                onDismissNew={() => dismissNews.mutate({ sourceKey: source.key })}
              />
            );
          })}
        </div>
      )}
      {loose > 0 && sources.length > 0 ? (
        <p className="text-xs text-muted-foreground">{t("sources.loose", { count: loose })}</p>
      ) : null}
      <GitPreviewDialog
        preview={browse.preview}
        onDismiss={browse.dismiss}
        onConfirm={browse.confirm}
      />
    </div>
  );
}
