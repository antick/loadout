import type { AgentDetection } from "@loadout/shared";
import { ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";
import { cn } from "@/lib/utils";

/** Why the app thinks the agent is installed, or where it looked and found nothing. */
export function AgentDetectionNote({
  detection,
  className,
}: {
  detection: AgentDetection;
  className?: string;
}): ReactNode {
  const { t } = useTranslation();
  const { data: info } = useAppInfo();
  // A custom agent is the user's own: there is nothing to explain.
  if (detection.reason === "custom") return null;
  const path = detection.path ? compactHome(detection.path, info?.homeDir) : "";
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs text-muted-foreground",
        detection.reason === "missing" && "text-warning",
        className,
      )}
    >
      <ScanSearch className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0 break-words">
        {t(`settings.agents.detection.${detection.reason}`, { path })}
      </span>
    </p>
  );
}
