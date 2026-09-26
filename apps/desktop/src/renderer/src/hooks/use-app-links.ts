import { useTranslation } from "react-i18next";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useAppInfo } from "@/hooks/queries/app";
import { bugReportUrl, releaseNotesUrl } from "@/lib/app-links";

export interface AppLinks {
  /** The running version; null until the app has said which it is. */
  version: string | null;
  openReleaseNotes(): void;
  reportBug(): void;
}

/** This version's release notes and a bug report pre-filled with the version and system. */
export function useAppLinks(): AppLinks {
  const { t } = useTranslation();
  const { data: info } = useAppInfo();
  const openExternal = useOpenExternal();
  const version = info?.version ?? null;

  return {
    version,
    openReleaseNotes: () => {
      if (version) openExternal.mutate(releaseNotesUrl(version));
    },
    reportBug: () => {
      const body = t("appLinks.bugBody", {
        version: version ?? t("appLinks.unknown"),
        system: info ? t(`appLinks.platform.${info.platform}`) : t("appLinks.unknown"),
      });
      openExternal.mutate(bugReportUrl(body));
    },
  };
}
