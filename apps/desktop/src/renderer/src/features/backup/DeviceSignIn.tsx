import { Copy, ExternalLink, LogIn } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCopyText, useOpenExternal } from "@/hooks/mutations/app";
import type { DeviceFlow } from "./use-device-flow";

export interface DeviceSignInProps {
  flow: DeviceFlow;
  disabled: boolean;
  onBegin: () => void;
}

/** "Sign in with GitHub": a button, then the one-time code shown large while we wait. */
export function DeviceSignIn({ flow, disabled, onBegin }: DeviceSignInProps): ReactNode {
  const { t } = useTranslation();
  const copy = useCopyText();
  const openExternal = useOpenExternal();
  const { phase, session } = flow;

  if (phase === "waiting" && session) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-center">
        <p className="text-sm text-muted-foreground">{t("backupPage.github.enterCode")}</p>
        <div className="flex items-center gap-2">
          <output
            data-selectable
            className="font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums"
          >
            {session.userCode}
          </output>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("backupPage.github.copyCode")}
            title={t("backupPage.github.copyCode")}
            onClick={() => copy.mutate(session.userCode)}
          >
            <Copy />
          </Button>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          {t("backupPage.github.waiting")}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openExternal.mutate(session.verificationUri)}
          >
            <ExternalLink />
            {t("backupPage.github.openAgain")}
          </Button>
          <Button variant="ghost" size="sm" onClick={flow.cancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {phase === "expired" ? (
        <p role="alert" className="text-sm text-warning">
          {t("backupPage.github.codeExpired")}
        </p>
      ) : null}
      <Button
        className="self-start"
        size="sm"
        disabled={disabled || phase === "starting"}
        onClick={onBegin}
      >
        {phase === "starting" ? <Spinner /> : <LogIn />}
        {t(phase === "expired" ? "backupPage.github.signInAgain" : "backupPage.github.signIn")}
      </Button>
    </div>
  );
}
