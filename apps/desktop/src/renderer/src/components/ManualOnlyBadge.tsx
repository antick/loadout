import { Hand } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A skill agents only run when a person calls it (`disable-model-invocation: true`). */
export function ManualOnlyBadge({ compact }: { compact?: boolean }): ReactNode {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <StatusBadge
            tone="neutral"
            icon={<Hand />}
            label={t("skills.manualOnly")}
            compact={compact}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{t("skills.manualOnlyHint")}</TooltipContent>
    </Tooltip>
  );
}
