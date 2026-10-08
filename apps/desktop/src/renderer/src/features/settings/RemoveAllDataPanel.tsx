import { type AgentFolderSummary, type RemoveAllDataOptions, formatBytes } from "@loadout/shared";
import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Choice, ChoiceCards } from "@/components/ChoiceCards";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { PageSection } from "@/components/PageSection";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useRemoveAllData } from "@/features/settings/storage-mutations";
import { useAgentFolders } from "@/features/settings/storage-queries";

/** What happens to the skills Loadout put into agent folders. */
type AgentFolderChoice = "keep" | "copies" | "none";

const OPTIONS: Record<AgentFolderChoice, RemoveAllDataOptions> = {
  keep: { removeCopies: false, keepLinkedSkills: true },
  copies: { removeCopies: false },
  none: { removeCopies: true },
};

function useFolderChoices(summary: AgentFolderSummary | undefined): Choice<AgentFolderChoice>[] {
  const { t } = useTranslation();
  const linked = summary?.linkedFolders ?? 0;
  const copies = summary?.copiedFolders ?? 0;
  const edited = summary?.editedCopies ?? 0;
  const size = formatBytes(summary?.linkedBytes ?? 0);
  return [
    {
      value: "keep",
      title: t("settings.storage.removeAll.keep.title"),
      description: t("settings.storage.removeAll.keep.description", {
        count: linked,
        size,
        copies,
      }),
    },
    {
      value: "copies",
      title: t("settings.storage.removeAll.copiesOnly.title"),
      description: t("settings.storage.removeAll.copiesOnly.description", {
        count: linked,
        copies,
      }),
    },
    {
      value: "none",
      title: t("settings.storage.removeAll.none.title"),
      description: [
        t("settings.storage.removeAll.none.description", { count: linked + copies }),
        edited > 0 ? t("settings.storage.removeAll.none.keptEdited", { count: edited }) : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];
}

/** Delete everything Loadout keeps on this computer and quit, after saying exactly what goes. */
export function RemoveAllDataPanel({ homePath }: { homePath: string }): ReactNode {
  const { t } = useTranslation();
  const remove = useRemoveAllData();
  const [open, setOpen] = useState(false);
  // Keeping every skill is the choice nobody regrets, so it is the default.
  const [choice, setChoice] = useState<AgentFolderChoice>("keep");
  const summary = useAgentFolders(open);
  const choices = useFolderChoices(summary.data);

  return (
    <PageSection
      variant="card"
      tone="danger"
      title={t("settings.storage.removeAll.title")}
      description={t("settings.storage.removeAll.description")}
      actions={
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          <Trash2 />
          {t("settings.storage.removeAll.button")}
        </Button>
      }
    >
      <AlertDialog open={open} onOpenChange={(next) => !remove.isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.storage.removeAll.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <p>{t("settings.storage.removeAll.deletes", { path: homePath })}</p>
                <p>{t("settings.storage.removeAll.keeps")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("settings.storage.removeAll.agentFolders")}</p>
            {/* The counts are what the choice is made on: never shown as zeros while unknown. */}
            {summary.isError ? (
              <LoadErrorNotice error={summary.error} onRetry={() => void summary.refetch()} />
            ) : summary.data ? (
              <ChoiceCards
                value={choice}
                choices={choices}
                onChange={setChoice}
                label={t("settings.storage.removeAll.agentFolders")}
              />
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending || !summary.data}
              onClick={() => remove.mutate(OPTIONS[choice])}
            >
              {remove.isPending ? <Spinner /> : <Trash2 />}
              {t("settings.storage.removeAll.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSection>
  );
}
