import { formatRelative } from "@skillboard/shared";
import { useNavigate } from "@tanstack/react-router";
import { Bug } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ShellBanner } from "@/components/ShellBanner";
import { Button } from "@/components/ui/button";
import { useClearLastCrash } from "@/hooks/mutations/app";
import { useLastCrash } from "@/hooks/queries/app";

/** Shown once after a crash: what happened, a way to the logs, and dismiss. */
export function CrashBanner(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const crash = useLastCrash();
  const clear = useClearLastCrash();
  if (!crash.data) return null;

  return (
    <ShellBanner
      tone="danger"
      icon={Bug}
      title={t("banners.crashTitle", { when: formatRelative(crash.data.at) })}
      description={crash.data.message}
      actions={
        <>
          <Button variant="ghost" size="xs" onClick={() => void navigate({ to: "/settings" })}>
            {t("banners.viewLogs")}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={clear.isPending}
            onClick={() => clear.mutate()}
          >
            {t("common.dismiss")}
          </Button>
        </>
      }
    />
  );
}
