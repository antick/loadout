import type { SecretFinding, Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { FolderOpen, KeyRound, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconButton } from "@/components/IconButton";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAllowSecrets, useCleanUpUnpushed } from "@/features/backup/backup-mutations";
import { useSyncFlow } from "@/features/backup/sync-flow";
import { useBackupSecrets } from "@/features/backup/backup-queries";
import { useRevealPath } from "@/hooks/mutations/app";

export interface HeldBackSecretsProps {
  /** Only a backup with a remote sends anything anywhere. */
  enabled: boolean;
  skills: readonly Skill[];
}

/**
 * Text the next backup would push that looks like a key or token. The backup waits until each
 * one is removed from its skill, or the user says it is safe to share.
 */
export function HeldBackSecrets({ enabled, skills }: HeldBackSecretsProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const findings = useBackupSecrets(enabled);
  // Then the sync goes through the review like every other "sync now", never around it.
  const flow = useSyncFlow();
  const allow = useAllowSecrets();
  const cleanUp = useCleanUpUnpushed();
  const reveal = useRevealPath();
  const list = findings.data ?? [];
  if (!enabled || list.length === 0) return null;

  const skillFor = (finding: SecretFinding): Skill | undefined => {
    const dir = finding.file.split("/")[0];
    return skills.find((skill) => skill.dirName === dir);
  };

  const inHistoryOnly = list.every((finding) => finding.committed);
  const busy = allow.isPending || cleanUp.isPending || flow.busy;

  const cleanUpHistory = async (): Promise<void> => {
    const ok = await confirm({
      title: t("backupPage.secrets.cleanUpTitle"),
      description: t("backupPage.secrets.cleanUpBody"),
      confirmLabel: t("backupPage.secrets.cleanUp"),
    });
    if (ok) cleanUp.mutate(undefined, { onSuccess: () => flow.start() });
  };

  const backUpAnyway = async (): Promise<void> => {
    const ok = await confirm({
      title: t("backupPage.secrets.confirmTitle", { count: list.length }),
      description: t("backupPage.secrets.confirmBody", { count: list.length }),
      items: list.map((finding) => `${finding.file}:${finding.line}`),
      confirmLabel: t("backupPage.secrets.backUpAnyway"),
      destructive: true,
    });
    if (ok)
      allow.mutate(
        list.map((finding) => finding.id),
        { onSuccess: () => flow.start() },
      );
  };

  return (
    <PageSection
      title={t("backupPage.secrets.title")}
      description={t("backupPage.secrets.description", { count: list.length })}
    >
      <ul className="flex flex-col divide-y rounded-lg border border-warning/40 bg-card">
        {list.map((finding) => {
          const skill = skillFor(finding);
          const relative = finding.file.split("/").slice(1).join("/");
          return (
            <li key={finding.id} className="flex items-center gap-3 px-4 py-2.5">
              <KeyRound className="size-4 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {t(`backupPage.secrets.kind.${finding.kind}`)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span data-selectable className="font-mono">
                    {finding.file}:{finding.line}
                  </span>
                  {" · "}
                  <span className="font-mono">{finding.masked}</span>
                  {finding.committed ? (
                    <>
                      {" · "}
                      {t("backupPage.secrets.inHistory")}
                    </>
                  ) : null}
                </p>
              </div>
              {skill ? (
                <Button asChild variant="outline" size="xs">
                  <Link
                    to="/library/$skillId/edit"
                    params={{ skillId: skill.id }}
                    search={{ file: relative }}
                  >
                    <Pencil />
                    {t("backupPage.secrets.edit")}
                  </Link>
                </Button>
              ) : null}
              <IconButton
                label={t("common.reveal")}
                icon={<FolderOpen />}
                onClick={() => reveal.mutate(finding.path)}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {inHistoryOnly ? t("backupPage.secrets.historyHint") : t("backupPage.secrets.hint")}
        </p>
        {inHistoryOnly ? (
          <Button size="sm" disabled={busy} onClick={() => void cleanUpHistory()}>
            {cleanUp.isPending ? <Spinner /> : null}
            {t("backupPage.secrets.cleanUp")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void backUpAnyway()}>
          {allow.isPending ? <Spinner /> : null}
          {t("backupPage.secrets.backUpAnyway")}
        </Button>
      </div>
    </PageSection>
  );
}
