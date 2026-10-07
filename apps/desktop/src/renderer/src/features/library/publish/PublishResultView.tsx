import { formatNameList } from "@loadout/shared";
import type { PublishResult } from "@loadout/shared";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CopyableCommand } from "@/components/CopyableCommand";
import { InlineNotice } from "@/components/InlineNotice";

/** What happened after Publish: what went out, and how anyone installs it. */
export function PublishResultView({ result }: { result: PublishResult }): ReactNode {
  const { t } = useTranslation();
  const skipped = result.plan.skills.filter((skill) => skill.status === "skipped");
  return (
    <div className="flex flex-col gap-3">
      <InlineNotice tone={result.commit ? "success" : "neutral"} icon={CheckCircle2}>
        {result.commit
          ? t("publish.result.published", {
              count: result.published.length,
              names: formatNameList(result.published),
            })
          : t("publish.result.nothing")}
        {result.unchanged.length > 0 && result.commit
          ? ` ${t("publish.result.unchanged", { count: result.unchanged.length })}`
          : ""}
      </InlineNotice>
      {skipped.length > 0 ? (
        <p className="text-xs text-muted-foreground" data-selectable>
          {t("publish.result.skipped", {
            names: formatNameList(skipped.map((skill) => skill.name)),
          })}
        </p>
      ) : null}
      {result.installCommands.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("publish.result.install")}</p>
          {result.installCommands.map((command) => (
            <CopyableCommand key={command} command={command} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("publish.result.noInstall")}</p>
      )}
    </div>
  );
}
