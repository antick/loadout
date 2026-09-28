import type { ItemDeploymentState, ItemWarning } from "@loadout/shared";
import { useTranslation } from "react-i18next";
import type { StatusTone } from "@/components/StatusBadge";

/** A conversion note in the app's words; the core's English `message` is for the CLI. */
export function useWarningText(): (warning: ItemWarning) => string {
  const { t } = useTranslation();
  return (warning) =>
    t(`items.warnings.${warning.code}`, { ...warning.params, defaultValue: warning.message });
}

export const STATE_TONES: Record<ItemDeploymentState, StatusTone> = {
  in_sync: "success",
  outdated: "info",
  edited: "warning",
  missing: "danger",
};

/** The highlighter's name for the language of a converted file. */
export function languageOfPath(path: string): string {
  return path.endsWith(".toml") ? "toml" : "markdown";
}
