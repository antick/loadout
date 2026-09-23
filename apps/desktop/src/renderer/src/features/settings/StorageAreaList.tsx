import { formatBytes, type StorageEntry } from "@loadout/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useClearAppCache, useClearStorage } from "@/hooks/mutations/storage";

export interface StorageAreaListProps {
  entries: readonly StorageEntry[];
}

/** One row per area: what it is, where, how big, and how to empty it when that is safe. */
export function StorageAreaList({ entries }: StorageAreaListProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const clear = useClearStorage();
  const clearApp = useClearAppCache();

  const onClear = async (entry: StorageEntry): Promise<void> => {
    const title = t(`settings.storage.areas.${entry.area}.title`);
    const ok = await confirm({
      title: t("settings.storage.confirmClear.title", { area: title }),
      description: t(`settings.storage.areas.${entry.area}.clearEffect`),
      confirmLabel: t("settings.storage.clear"),
    });
    if (!ok) return;
    if (entry.area === "app") clearApp.mutate();
    else if (entry.clearable) clear.mutate(entry.area as Parameters<typeof clear.mutate>[0]);
  };

  return (
    <ul className="flex flex-col divide-y">
      {entries.map((entry) => {
        const busy =
          (entry.area === "app" && clearApp.isPending) ||
          (clear.isPending && clear.variables === entry.area);
        const canClear = entry.clearable || entry.area === "app";
        return (
          <li key={entry.area} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-medium">
                {t(`settings.storage.areas.${entry.area}.title`)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`settings.storage.areas.${entry.area}.description`)}
              </p>
              <PathText path={entry.path} />
            </div>
            <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
              {entry.exists ? formatBytes(entry.bytes) : t("settings.storage.empty")}
            </span>
            <div className="w-20 shrink-0 text-right">
              {canClear ? (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy || !entry.exists || entry.bytes === 0}
                  onClick={() => void onClear(entry)}
                >
                  {busy ? <Spinner className="size-3" /> : null}
                  {t("settings.storage.clear")}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
