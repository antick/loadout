import {
  canLinkSource,
  canReportSkill,
  formatDateTime,
  formatRelative,
  type Skill,
  formatRevision,
} from "@loadout/shared";
import {
  ArrowUpCircle,
  Download,
  ExternalLink,
  FolderSearch,
  FolderSync,
  MessageSquareWarning,
  RefreshCw,
  Unlink,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { InlineNotice } from "@/components/InlineNotice";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ReportProblemDialog } from "@/features/library/detail/ReportProblemDialog";
import { useDetachSkill } from "@/features/library/detail/skill-mutations";
import type { SkillRefresh } from "@/features/library/detail/use-skill-refresh";
import { useCheckSkillUpdate } from "@/features/library/library-mutations";
import { FindSourceSection } from "@/features/origin/FindSourceSection";
import { useOpenExternal, usePickFolder } from "@/hooks/mutations/app";
import { installPhaseText } from "@/features/install/install-tasks";
import { hasSource, isRemoteSource } from "@/lib/skill-source";

/** A source that is a path on this computer (POSIX, home or Windows drive), not an address. */
const ABSOLUTE_PATH_PATTERN = /^(\/|~|[A-Za-z]:[\\/])/;

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="contents">
      <dt className="py-1.5 pr-6 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 py-1.5">{children}</dd>
    </div>
  );
}

/** `unknownLabel`: what to say when there is none, "None" by default. */
function Revision({
  value,
  unknownLabel,
}: {
  value: string | null;
  unknownLabel?: string;
}): ReactNode {
  const { t } = useTranslation();
  if (!value) {
    return (
      <span className="text-muted-foreground">{unknownLabel ?? t("library.source.none")}</span>
    );
  }
  return (
    <span data-selectable title={value} className="font-mono text-xs">
      {formatRevision(value)}
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
  const openExternal = useOpenExternal();
  const [reporting, setReporting] = useState(false);

  const remote = isRemoteSource(skill);
  /** An archive linked on the web: checked and refreshed by downloading it again. */
  const link = skill.sourceType === "url";
  const sourced = hasSource(skill);
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
            {t(`library.refresh.phases.${refresh.progress?.phase ?? "starting"}`, {
              // A phase without update wording reads as it does for an install.
              defaultValue: installPhaseText(refresh.progress),
            })}
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
              {canReportSkill(skill) ? (
                <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
                  <MessageSquareWarning />
                  {t("feedback.action")}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {link ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => check.mutate(skill.id)}
                >
                  {check.isPending ? <Spinner /> : <RefreshCw />}
                  {t("library.source.checkNow")}
                </Button>
              ) : null}
              <Button
                variant={link && skill.updateStatus === "update_available" ? "default" : "outline"}
                size="sm"
                disabled={busy || !sourced}
                onClick={() => refresh.start({ kind: "reimport" })}
              >
                {refresh.runningKind === "reimport" ? (
                  <Spinner />
                ) : link ? (
                  <Download />
                ) : (
                  <FolderSync />
                )}
                {t(link ? "library.source.downloadAgain" : "library.source.reimport")}
              </Button>
              {link ? null : (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void relink()}>
                  {refresh.runningKind === "relink" ? <Spinner /> : <FolderSearch />}
                  {t("library.source.relink")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || !sourced}
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
          <Row label={t(link ? "library.source.link" : "library.source.ref")}>
            {skill.sourceRef ? (
              link ? (
                <span className="flex min-w-0 items-start gap-1.5">
                  <span data-selectable className="min-w-0 font-mono text-xs break-all">
                    {skill.sourceRef}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="-my-0.5 shrink-0"
                    aria-label={t("library.source.openLink")}
                    title={t("library.source.openLink")}
                    onClick={() => openExternal.mutate(skill.sourceRef ?? "")}
                  >
                    <ExternalLink />
                  </Button>
                </span>
              ) : ABSOLUTE_PATH_PATTERN.test(skill.sourceRef) ? (
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
          {!remote && skill.sourceSubpath ? (
            <Row label={t("library.source.archiveSubpath")}>
              <span data-selectable className="font-mono text-xs break-all">
                {skill.sourceSubpath}
              </span>
            </Row>
          ) : null}
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
                {/* A repository skill always has one; without it, which commit it is is unknown. */}
                <Revision
                  value={skill.sourceRevision}
                  unknownLabel={t("library.source.unknownRevision")}
                />
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

      {canLinkSource(skill) ? <FindSourceSection skill={skill} /> : null}

      <ReportProblemDialog skill={reporting ? skill : null} onOpenChange={setReporting} />
    </div>
  );
}
