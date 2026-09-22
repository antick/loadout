import { formatRelative, type InstallProgress } from "@loadout/shared";
import {
  Bot,
  CircleFadingArrowUp,
  CloudUpload,
  Copy,
  Library,
  Link2,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBarItem } from "@/components/layout/status-bar/StatusBarItem";
import { ThemeMenu } from "@/components/layout/status-bar/ThemeMenu";
import { Spinner } from "@/components/ui/spinner";
import { hasUpdate, needsAttention } from "@/features/library/library-filters";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { useBackupStatus } from "@/hooks/queries/app";
import { useSetting } from "@/hooks/queries/settings";
import { useSkills } from "@/hooks/queries/skills";
import { STATUS_BAR_HEIGHT_CLASS } from "@/lib/constants";
import { backupTone } from "@/lib/backup-tone";
import { useAppEvent } from "@/lib/events";
import { cn } from "@/lib/utils";

/** How long a finished install stays in the status bar before it clears. */
const PROGRESS_LINGER_MS = 1500;

/** What an install or update running in the background is doing, in a few words. */
function useBackgroundWork(): string | null {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  useAppEvent("install:progress", setProgress);

  useEffect(() => {
    if (progress?.phase !== "done") return;
    const timer = window.setTimeout(() => setProgress(null), PROGRESS_LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [progress]);

  if (!progress) return null;
  if (progress.phase === "installing" && progress.total && progress.name) {
    return t("install.phase.installingCount", {
      current: progress.current ?? 0,
      total: progress.total,
      name: progress.name,
    });
  }
  if (progress.phase === "installing" && progress.name) {
    return t("install.phase.installingNamed", { name: progress.name });
  }
  return t(`install.phase.${progress.phase}`);
}

/**
 * The line along the bottom of the window: backup state, what in the library needs a look, any
 * work running in the background, then agents, deploy mode and the theme. Every entry opens the
 * place that explains it.
 */
export function StatusBar(): ReactNode {
  const { t } = useTranslation();
  const backup = useBackupStatus();
  const skills = useSkills();
  const agents = useAvailableAgents();
  const deployMode = useSetting("deployMode");
  const work = useBackgroundWork();

  const all = skills.data ?? [];
  const attention = all.filter(needsAttention).length;
  const updates = all.filter(hasUpdate).length;
  const tone = backupTone(backup.data);
  const backupText =
    tone === "success"
      ? t("statusBar.backup.success", { when: formatRelative(backup.data?.lastCommitAt) })
      : tone === "warning"
        ? t("statusBar.backup.warning", { count: backup.data?.changedSkillCount ?? 0 })
        : tone
          ? t(`statusBar.backup.${tone}`)
          : null;

  return (
    <footer
      className={cn(
        "flex w-full shrink-0 items-center gap-1 border-t bg-sidebar px-2 text-xs text-sidebar-foreground",
        STATUS_BAR_HEIGHT_CLASS,
      )}
    >
      {backupText ? (
        <StatusBarItem
          icon={<CloudUpload />}
          link={{ to: "/backup" }}
          hint={t(`backup.dot.${tone ?? "neutral"}`)}
          tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "default"}
        >
          {backupText}
        </StatusBarItem>
      ) : null}
      {skills.data ? (
        <StatusBarItem
          icon={<Library />}
          link={{ to: "/library" }}
          hint={t("statusBar.skillsHint")}
        >
          {t("statusBar.skills", { count: all.length })}
        </StatusBarItem>
      ) : null}
      {attention > 0 ? (
        <StatusBarItem
          icon={<TriangleAlert />}
          link={{ to: "/library", search: { status: "attention" } }}
          hint={t("statusBar.attentionHint")}
          tone="danger"
        >
          {t("statusBar.attention", { count: attention })}
        </StatusBarItem>
      ) : null}
      {updates > 0 ? (
        <StatusBarItem
          icon={<CircleFadingArrowUp />}
          link={{ to: "/library", search: { status: "updates" } }}
          hint={t("statusBar.updatesHint")}
          tone="info"
        >
          {t("statusBar.updates", { count: updates })}
        </StatusBarItem>
      ) : null}
      {work ? (
        <output aria-live="polite" className="ml-1 inline-flex min-w-0 items-center gap-1.5 px-1.5">
          <Spinner className="size-3" />
          <span className="truncate text-muted-foreground">{work}</span>
        </output>
      ) : null}

      <span className="flex-1" />

      {agents.data ? (
        <StatusBarItem icon={<Bot />} link={{ to: "/agents" }} hint={t("statusBar.agentsHint")}>
          {t("statusBar.agents", { count: agents.data.length })}
        </StatusBarItem>
      ) : null}
      <StatusBarItem
        icon={deployMode === "copy" ? <Copy /> : <Link2 />}
        link={{ to: "/settings", search: { section: "general" } }}
        hint={t(`statusBar.deployMode.${deployMode}Hint`)}
      >
        {t(`statusBar.deployMode.${deployMode}`)}
      </StatusBarItem>
      <ThemeMenu />
    </footer>
  );
}
