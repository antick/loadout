import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAppUpdate } from "@/hooks/queries/app";
import { APP_UPDATE_CHECK_DELAY_MS } from "@/lib/constants";

/** Checks for an app update shortly after launch and toasts once when there is one. */
export function AppUpdateToast(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const announced = useRef(false);
  const update = useAppUpdate(ready);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), APP_UPDATE_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (announced.current || !update.data?.hasUpdate) return;
    announced.current = true;
    toast.info(t("appUpdate.available", { version: update.data.latestVersion ?? "" }), {
      duration: Number.POSITIVE_INFINITY,
      action: { label: t("appUpdate.view"), onClick: () => void navigate({ to: "/settings" }) },
    });
  }, [update.data, t, navigate]);

  return null;
}
