import {
  SAFETY_SCAN_LIBRARY_KEY,
  SAFETY_SCANNER_INSTALL_COMMAND,
  SAFETY_SCANNER_URL,
} from "@loadout/shared";
import { ExternalLink, ScanSearch, ShieldCheck, ShieldOff } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyableCommand } from "@/components/CopyableCommand";
import { InlineNotice } from "@/components/InlineNotice";
import { Panel } from "@/components/Panel";
import { PathText } from "@/components/PathText";
import { SettingRow } from "@/components/SettingRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useInstallTask } from "@/features/install/use-install-task";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useScanLibrary } from "@/hooks/mutations/safety";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useSafetyReports, useSafetyStatus } from "@/hooks/queries/safety";
import { useSetting } from "@/hooks/queries/settings";
import { useSkills } from "@/hooks/queries/skills";
import { toastSuccess } from "@/lib/toast";

/** Where the scanner is, when the machine's own search cannot find it. */
function ScannerPathForm({ saved }: { saved: string }): ReactNode {
  const { t } = useTranslation();
  const setSetting = useSetSetting();
  const inputId = useId();
  const [draft, setDraft] = useState(saved);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const value = draft.trim();
    setSetting.mutate(
      { key: "safetyScannerPath", value },
      {
        onSuccess: () =>
          toastSuccess(t(value ? "settings.safety.pathSaved" : "settings.safety.pathCleared")),
      },
    );
  };
  return (
    <form onSubmit={submit}>
      <SettingRow
        label={t("settings.safety.path")}
        description={t("settings.safety.pathHint")}
        htmlFor={inputId}
        stacked
      >
        <Input
          id={inputId}
          value={draft}
          spellCheck={false}
          placeholder={t("settings.safety.pathPlaceholder")}
          className="max-w-xl font-mono text-sm"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={draft.trim() === saved || setSetting.isPending}
        >
          {t("common.save")}
        </Button>
      </SettingRow>
    </form>
  );
}

/** How many library skills were scanned, flagged, or not scanned yet. */
function LibraryCoverage(): ReactNode {
  const { t } = useTranslation();
  const { data: skills } = useSkills();
  const reports = useSafetyReports();
  const total = skills?.length ?? 0;
  const current = [...reports.values()].filter((record) => !record.stale);
  const unsafe = current.filter((record) => record.verdict === "unsafe").length;
  const caution = current.filter((record) => record.verdict === "caution").length;
  const due = total - current.length;
  return (
    <span className="tabular-nums">
      {[
        t("settings.safety.coverage.scanned", { count: current.length, total }),
        ...(unsafe > 0 ? [t("settings.safety.coverage.unsafe", { count: unsafe })] : []),
        ...(caution > 0 ? [t("settings.safety.coverage.caution", { count: caution })] : []),
        ...(due > 0 ? [t("settings.safety.coverage.due", { count: due })] : []),
      ].join(" · ")}
    </span>
  );
}

/**
 * The optional SkillSpector scanner: whether it is here, checking installs with it, and scanning
 * the whole library.
 */
export function SafetySection(): ReactNode {
  const { t } = useTranslation();
  const status = useSafetyStatus();
  const setSetting = useSetSetting();
  const scanOnInstall = useSetting("safetyScanOnInstall");
  const savedPath = useSetting("safetyScannerPath");
  const scanLibrary = useScanLibrary();
  const { task } = useInstallTask();
  const openExternal = useOpenExternal();
  const switchId = useId();
  const scanning = Boolean(task(SAFETY_SCAN_LIBRARY_KEY));
  const available = status.data?.available ?? false;

  let found: ReactNode;
  if (status.isPending) found = <Skeleton className="h-10 w-full" />;
  else if (available && status.data?.path) {
    found = (
      <InlineNotice tone="success" icon={ShieldCheck}>
        <p>
          {t("settings.safety.found", {
            version: status.data.version ?? t("settings.safety.unknownVersion"),
          })}
        </p>
        <PathText path={status.data.path} className="text-xs" />
      </InlineNotice>
    );
  } else {
    found = (
      <InlineNotice tone="warning" icon={ShieldOff}>
        <div className="flex flex-col gap-2">
          <p>{t("settings.safety.missing")}</p>
          <CopyableCommand
            command={SAFETY_SCANNER_INSTALL_COMMAND}
            caption={t("settings.safety.installCaption")}
          />
          <p className="text-xs">{t("settings.safety.missingAfter")}</p>
        </div>
      </InlineNotice>
    );
  }

  return (
    <>
      <Panel
        title={t("settings.safety.title")}
        description={t("settings.safety.description")}
        actions={
          <Button variant="ghost" size="sm" onClick={() => openExternal.mutate(SAFETY_SCANNER_URL)}>
            <ExternalLink />
            {t("settings.safety.about")}
          </Button>
        }
      >
        {found}
        <div className="flex flex-col divide-y">
          <SettingRow
            label={t("settings.safety.onInstall")}
            description={t("settings.safety.onInstallHint")}
            htmlFor={switchId}
          >
            <Switch
              id={switchId}
              checked={scanOnInstall && available}
              disabled={!available}
              onCheckedChange={(value) => setSetting.mutate({ key: "safetyScanOnInstall", value })}
            />
          </SettingRow>
          <SettingRow
            label={t("settings.safety.library")}
            description={available ? <LibraryCoverage /> : t("settings.safety.libraryNeedsScanner")}
          >
            <Button
              variant="outline"
              disabled={!available || scanning}
              onClick={() => void scanLibrary(false)}
            >
              {scanning ? <Spinner /> : <ScanSearch />}
              {t("settings.safety.scanNow")}
            </Button>
            <Button
              variant="ghost"
              disabled={!available || scanning}
              onClick={() => void scanLibrary(true)}
            >
              {t("settings.safety.rescanAll")}
            </Button>
          </SettingRow>
          <ScannerPathForm key={savedPath} saved={savedPath} />
        </div>
      </Panel>
    </>
  );
}
