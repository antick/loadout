import type { AppUpdateStatus } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useDownloadAppUpdate, useInstallAppUpdate } from "@/hooks/mutations/app-update";
import { useAppUpdate } from "@/hooks/queries/app";

/** Blockers that mean "this is a development build": nothing to tell the user. */
const QUIET_BLOCKERS = new Set(["not_configured", "development"]);

/**
 * Tells the user about app updates the main process found: once when a version is available,
 * once when it is downloaded and ready, and once after a restart that installed (or failed to
 * install) one. The full controls live in Settings → About.
 */
export function AppUpdateToast(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const update = useAppUpdate();
  const download = useDownloadAppUpdate();
  const install = useInstallAppUpdate();
  const openExternal = useOpenExternal();
  const announced = useRef(new Set<string>());
  const previous = useRef<AppUpdateStatus | null>(null);

  useEffect(() => {
    const status = update.data;
    if (!status) return;
    const before = previous.current;
    previous.current = status;
    const once = (key: string): boolean => {
      if (announced.current.has(key)) return false;
      announced.current.add(key);
      return true;
    };
    const version = status.latestVersion ?? "";
    const toastId = `app-update-${version}`;
    const openAbout = (): void => void navigate({ to: "/settings", search: { section: "about" } });

    if (status.lastInstall && once(`installed-${status.lastInstall.version}`)) {
      const { ok, version: installed } = status.lastInstall;
      if (ok) toast.success(t("appUpdate.installed", { version: installed }));
      else {
        toast.error(t("appUpdate.notInstalled", { version: installed }), {
          description: t("appUpdate.notInstalledDescription"),
          duration: Number.POSITIVE_INFINITY,
          action: { label: t("appUpdate.details"), onClick: openAbout },
        });
      }
    }
    if (status.blocker && QUIET_BLOCKERS.has(status.blocker)) return;

    if (status.phase === "available" && once(`available-${version}`)) {
      toast.info(t("appUpdate.available", { version }), {
        id: toastId,
        duration: Number.POSITIVE_INFINITY,
        action: status.blocker
          ? {
              label: t("appUpdate.download"),
              onClick: () => openExternal.mutate(status.releaseUrl),
            }
          : { label: t("appUpdate.update"), onClick: () => download.mutate() },
        cancel: { label: t("appUpdate.later"), onClick: () => undefined },
      });
    }
    if (status.phase === "ready" && once(`ready-${version}`)) {
      toast.success(t("appUpdate.ready", { version }), {
        id: toastId,
        description: t(
          status.method === "package" ? "appUpdate.readyPackage" : "appUpdate.readyRestart",
        ),
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: t(status.method === "package" ? "appUpdate.openInstaller" : "appUpdate.restart"),
          onClick: () => install.mutate(),
        },
        cancel: { label: t("appUpdate.later"), onClick: () => undefined },
      });
    }
    if (status.phase === "error" && before?.phase === "downloading") {
      toast.error(t("appUpdate.downloadFailed"), {
        id: toastId,
        description: status.error ?? undefined,
        action: { label: t("appUpdate.details"), onClick: openAbout },
      });
    }
  }, [update.data, t, navigate, download, install, openExternal]);

  return null;
}
