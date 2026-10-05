import { Hand } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";

/** A skill agents only run when a person calls it (`disable-model-invocation: true`). */
export function ManualOnlyBadge({ compact }: { compact?: boolean }): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone="neutral"
      icon={<Hand />}
      label={t("skills.manualOnly")}
      compact={compact}
      hint={t("skills.manualOnlyHint")}
    />
  );
}
