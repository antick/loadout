import { formatDateTime, formatRelative, type Skill } from "@skillboard/shared";
import { ArrowUpCircle, FolderSearch, FolderSync, RefreshCw, Unlink, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { InlineNotice } from "@/components/InlineNotice";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SkillRefresh } from "@/features/library/detail/use-skill-refresh";
import { useCheckSkillUpdate, useDetachSkill, usePickFolder } from "@/hooks/mutations/library";

/** Characters of a revision shown; the full value stays in the tooltip. */
const REVISION_DISPLAY_LENGTH = 10;
const ABSOLUTE_PATH_PATTERN = /^(\/|~|[A-Za-z]:[\\/])/;

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="contents">
      <dt className="py-1.5 pr-6 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 py-1.5">{children}</dd>
    </div>
  );
}

function Revision({ value }: { value: string | null }): ReactNode {
  const { t } = useTranslation();
  if (!value) return <span className="text-muted-foreground">{t("library.source.none")}</span>;
  return (
    <span data-selectable title={value} className="font-mono text-xs">
      {value.slice(0, REVISION_DISPLAY_LENGTH)}
    </span>
  );
}

export interface SourceTabProps {
  skill: Skill;
  refresh: SkillRefresh;
}

/** Where the skill came from, what is installed versus upstream, and the actions for its source. */
export function SourceTab({ skill, refresh }: SourceTabProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const check = useCheckSkillUpdate();
  const detach = useDetachSkill();
  const pickFolder = usePickFolder();

  const remote = skill.sourceType === "git" || skill.sourceType === "marketplace";
  const hasSource = Boolean(skill.sourceRef ?? skill.sourceUrl);
  const busy = refresh.running || check.isPending || detach.isPending;
  const none = <span className="text-muted-foreground">{t("library.source.none")}</span>;

  const relink = async (): Promise<void> => {
    const folder = await pickFolder.mutateAsync(t("library.source.relinkPickerTitle"));
    if (folder) refresh.start({ kind: "relink", sourcePath: folder });
  };

  const askDetach = async (): Promise<void> => {
    const ok = await confirm({
      title: t("library.source.detachTitle", { name: skill.name }),
      description: t("library.source.detachDescription"),
      confirmLabel: t("library.source.detach"),
    });
    if (ok) detach.mutate(skill.id);
  };

  return (
    <div className="flex flex-col gap-6">
      {refresh.running ? (
        <InlineNotice
          tone="info"
          icon={RefreshCw}
          actions={
            <Button variant="ghost" size="xs" onClick={refresh.cancel}>
              <X />
              {t("common.cancel")}
            </Button>
          }
        >
          <span aria-live="polite">
            {t(`library.refresh.phases.${refresh.progress?.phase ?? "starting"}`)}
          </span>
        </InlineNotice>
      ) : null}

      <PageSection
        title={t("library.source.title")}
        actions={
          remote ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => check.mutate(skill.id)}
              >
                {check.isPending ? <Spinner /> : <RefreshCw />}
                {t("library.source.checkNow")}
              </Button>
              <Button
                size="sm"
                variant={skill.updateStatus === "update_available" ? "default" : "outline"}
                disabled={busy}
                onClick={() => refresh.start({ kind: "update" })}
              >
                {refresh.runningKind === "update" ? <Spinner /> : <ArrowUpCircle />}
                {t("library.source.update")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !hasSource}
                onClick={() => refresh.start({ kind: "reimport" })}
              >
                {refresh.runningKind === "reimport" ? <Spinner /> : <FolderSync />}
                {t("library.source.reimport")}
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void relink()}>
                {refresh.runningKind === "relink" ? <Spinner /> : <FolderSearch />}
                {t("library.source.relink")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || !hasSource}
                onClick={() => void askDetach()}
              >
                <Unlink />
                {t("library.source.detach")}
              </Button>
            </>
          )
        }
      >
        <dl className="grid grid-cols-[max-content_1fr] rounded-lg border bg-card px-4 py-1 text-sm [&>div>*]:border-b [&>div:last-child>*]:border-b-0">
          <Row label={t("library.source.type")}>{t(`source.${skill.sourceType}`)}</Row>
          <Row label={t("library.source.ref")}>
            {skill.sourceRef ? (
              ABSOLUTE_PATH_PATTERN.test(skill.sourceRef) ? (
                <PathText path={skill.sourceRef} />
              ) : (
                <span data-selectable className="font-mono text-xs break-all">
                  {skill.sourceRef}
                </span>
              )
            ) : (
              none
            )}
          </Row>
          {remote ? (
            <>
              <Row label={t("library.source.url")}>
                {skill.sourceUrl ? (
                  <span data-selectable className="font-mono text-xs break-all">
                    {skill.sourceUrl}
                  </span>
                ) : (
                  none
                )}
              </Row>
              <Row label={t("library.source.branch")}>
                {skill.sourceBranch ? (
                  <span data-selectable className="font-mono text-xs">
                    {skill.sourceBranch}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("library.source.defaultBranch")}</span>
                )}
              </Row>
              <Row label={t("library.source.subpath")}>
                {skill.sourceSubpath ? (
                  <span data-selectable className="font-mono text-xs break-all">
                    {skill.sourceSubpath}
                  </span>
                ) : (
                  none
                )}
              </Row>
              <Row label={t("library.source.installedRevision")}>
                <Revision value={skill.sourceRevision} />
              </Row>
              <Row label={t("library.source.latestRevision")}>
                <Revision value={skill.remoteRevision} />
              </Row>
            </>
          ) : null}
          <Row label={t("library.source.lastChecked")}>
            {skill.lastCheckedAt ? (
              <span title={formatDateTime(skill.lastCheckedAt)}>
                {formatRelative(skill.lastCheckedAt)}
              </span>
            ) : (
              <span className="text-muted-foreground">{t("library.source.neverChecked")}</span>
            )}
          </Row>
          {skill.lastCheckError ? (
            <Row label={t("library.source.lastError")}>
              <span data-selectable className="text-danger">
                {skill.lastCheckError}
              </span>
            </Row>
          ) : null}
          <Row label={t("library.source.libraryFolder")}>
            <PathText path={skill.libraryPath} />
          </Row>
          <Row label={t("library.source.added")}>{formatDateTime(skill.createdAt)}</Row>
          <Row label={t("library.source.changed")}>{formatDateTime(skill.updatedAt)}</Row>
        </dl>
      </PageSection>
    </div>
  );
}
