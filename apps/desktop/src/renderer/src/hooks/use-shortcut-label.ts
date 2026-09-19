import { useAppInfo } from "@/hooks/queries/app";
import { type ShortcutId, shortcutLabel } from "@/lib/shortcuts";

/** Display text of an app shortcut for the current platform, e.g. "⌘K" or "Ctrl+K". */
export function useShortcutLabel(id: ShortcutId): string {
  return shortcutLabel(id, useAppInfo().data?.platform);
}
