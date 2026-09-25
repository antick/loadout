import {
  MARKETPLACE_NAME,
  type MarketAudit,
  type MarketAuditStatus,
  type MarketSkill,
  type Skill,
  formatCount,
  formatDate,
} from "@loadout/shared";
import {
  Check,
  Download,
  ExternalLink,
  FileQuestion,
  FolderGit2,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { InlineNotice } from "@/components/InlineNotice";
import { MarkdownView } from "@/components/MarkdownView";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { type InstallTask, installPhaseText } from "@/features/install/install-tasks";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useAgents } from "@/hooks/queries/agents";
import { useMarketDetail } from "@/hooks/queries/install";
import { useSkills } from "@/hooks/queries/skills";

const AUDIT_TONES: Record<MarketAuditStatus, StatusTone> = {
  pass: "success",
  warn: "warning",
  fail: "danger",
  unknown: "neutral",
};
const AUDIT_SKELETON_ROWS = 3;

export interface MarketDetailSheetProps {
  /** The skill to show; null keeps the sheet closed. */
  skill: MarketSkill | null;
  /** The running install of that skill, when there is one. */
  task?: InstallTask;
  onInstall: (skill: MarketSkill) => void;
  onCancel: (skill: MarketSkill) => void;
  onOpenLibrary: (skillId: string) => void;
  onClose: () => void;
}

/** The library copy of a marketplace skill, installed from the marketplace under that id. */
function libraryCopy(skills: readonly Skill[] | undefined, skill: MarketSkill): Skill | null {
  return (
    skills?.find((entry) => entry.sourceType === "marketplace" && entry.sourceRef === skill.id) ??
    null
  );
}

function AuditRow({ audit }: { audit: MarketAudit }): ReactNode {
  const { t } = useTranslation();
  const openExternal = useOpenExternal();
  const auditedAt = audit.auditedAt ? Date.parse(audit.auditedAt) : Number.NaN;
  const details = [
    audit.riskLevel ? t("install.market.detail.risk", { level: audit.riskLevel }) : null,
    Number.isFinite(auditedAt) ? formatDate(auditedAt) : null,
  ].filter(Boolean);
  return (
    <li>
      <button
        type="button"
        onClick={() => openExternal.mutate(audit.url)}
        className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{audit.provider}</span>
          {audit.summary ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">{audit.summary}</span>
          ) : null}
          {details.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {details.join(" · ")}
            </span>
          ) : null}
        </div>
        <StatusBadge
          tone={AUDIT_TONES[audit.status]}
          label={t(`install.market.detail.status.${audit.status}`)}
        />
      </button>
    </li>
  );
}

function AuditsSection({
  audits,
  loading,
}: {
  audits: MarketAudit[] | null | undefined;
  loading: boolean;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("install.market.detail.auditsTitle")}</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("install.market.detail.auditsHint", { marketplace: MARKETPLACE_NAME })}
      </p>
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: AUDIT_SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : audits === null || audits === undefined ? (
        <InlineNotice tone="warning" icon={ShieldQuestion}>
          {t("install.market.detail.auditsFailed")}
        </InlineNotice>
      ) : audits.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("install.market.detail.auditsNone")}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {audits.map((audit) => (
            <AuditRow key={audit.provider} audit={audit} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Where the library copy is deployed, or a note that it is not deployed yet. */
function LibraryNote({ copy, onOpen }: { copy: Skill; onOpen: () => void }): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents();
  const deployed = copy.deployments.map((deployment) => ({
    key: deployment.agentKey,
    name:
      agents.data?.find((agent) => agent.key === deployment.agentKey)?.displayName ??
      deployment.agentKey,
  }));
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <Check className="size-4 shrink-0 text-success" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">{t("install.market.detail.inLibrary")}</span>
        {deployed.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {t("install.market.detail.deployedTo")}
            {deployed.map((agent) => (
              <span key={agent.key} className="flex items-center gap-1">
                <AgentAvatar agentKey={agent.key} name={agent.name} size="sm" />
                {agent.name}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("install.market.detail.notDeployed")}
          </span>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onOpen}>
        {t("install.market.detail.openInLibrary")}
      </Button>
    </div>
  );
}

function DetailBody({
  skill,
  task,
  onInstall,
  onCancel,
  onOpenLibrary,
}: Omit<MarketDetailSheetProps, "skill" | "onClose"> & { skill: MarketSkill }): ReactNode {
  const { t } = useTranslation();
  const openExternal = useOpenExternal();
  const detail = useMarketDetail(skill);
  const skills = useSkills();
  const copy = libraryCopy(skills.data, skill);
  const installed = skill.installed || copy !== null;

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle className="truncate text-lg" title={skill.name}>
          {skill.name}
        </SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs" data-selectable>
              {skill.source}
            </span>
            <span
              className="flex items-center gap-1 text-xs tabular-nums"
              title={t("install.market.installs", { count: skill.installs })}
            >
              <Download className="size-3" />
              {formatCount(skill.installs)}
            </span>
          </div>
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {task ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!task.cancellable || task.cancelling}
              onClick={() => onCancel(skill)}
            >
              {task.cancelling ? <Spinner /> : <X />}
              {t("common.cancel")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={installed ? "outline" : "default"}
              onClick={() => onInstall(skill)}
            >
              {installed ? <RefreshCw /> : <Download />}
              {t(installed ? "install.market.reinstall" : "install.market.install")}
            </Button>
          )}
          {task ? (
            <span className="text-xs text-muted-foreground">{installPhaseText(task.progress)}</span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => detail.data && openExternal.mutate(detail.data.repoUrl)}
              disabled={!detail.data}
            >
              <FolderGit2 />
              {t("install.market.detail.repository")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => detail.data && openExternal.mutate(detail.data.pageUrl)}
              disabled={!detail.data}
            >
              <ExternalLink />
              {MARKETPLACE_NAME}
            </Button>
          </div>
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {copy ? <LibraryNote copy={copy} onOpen={() => onOpenLibrary(copy.id)} /> : null}

        <AuditsSection audits={detail.data?.audits} loading={detail.isPending} />

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">SKILL.md</h3>
            {detail.data?.documentPath ? (
              <span className="truncate font-mono text-xs text-muted-foreground" data-selectable>
                {detail.data.documentPath}
              </span>
            ) : null}
          </div>
          {detail.isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : detail.data?.document ? (
            <div className="rounded-lg border p-4">
              <MarkdownView content={detail.data.document} />
            </div>
          ) : (
            <InlineNotice
              tone="neutral"
              icon={FileQuestion}
              actions={
                detail.data ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openExternal.mutate(detail.data.repoUrl)}
                  >
                    {t("install.market.detail.repository")}
                  </Button>
                ) : null
              }
            >
              {t(
                detail.isError
                  ? "install.market.detail.documentFailed"
                  : "install.market.detail.documentMissing",
              )}
            </InlineNotice>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Read a marketplace skill before installing it: its security audits, where it is already in use,
 * and its SKILL.md. Opens from a card; installing works the same as from the card.
 */
export function MarketDetailSheet({ skill, onClose, ...props }: MarketDetailSheetProps): ReactNode {
  return (
    <Sheet
      open={skill !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        {skill ? <DetailBody key={skill.id} skill={skill} {...props} /> : null}
      </SheetContent>
    </Sheet>
  );
}
