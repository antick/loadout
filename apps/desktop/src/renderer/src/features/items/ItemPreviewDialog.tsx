import type { ItemPlaceRef, ItemRef } from "@loadout/shared";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { HighlightedCode } from "@/components/HighlightedCode";
import { InlineNotice } from "@/components/InlineNotice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useItemPreview } from "@/features/items/item-queries";
import { languageOfPath, useWarningText } from "./item-text";

export interface ItemPreviewDialogProps {
  item: ItemRef;
  /** Null keeps the dialog closed. */
  place: ItemPlaceRef | null;
  agentName: string;
  onClose: () => void;
}

/** The converted file an agent would get, and what the conversion could not carry over. */
export function ItemPreviewDialog({
  item,
  place,
  agentName,
  onClose,
}: ItemPreviewDialogProps): ReactNode {
  const { t } = useTranslation();
  const preview = useItemPreview(item, place);
  const warningText = useWarningText();

  return (
    <Dialog open={place !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("items.preview.title", { agent: agentName })}</DialogTitle>
          <DialogDescription className="break-all">
            {preview.data ? t("items.preview.description", { path: preview.data.path }) : null}
          </DialogDescription>
        </DialogHeader>
        {preview.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : preview.isError ? (
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            {preview.data.occupied ? (
              <InlineNotice tone="warning" icon={TriangleAlert}>
                {t("items.preview.occupied")}
              </InlineNotice>
            ) : null}
            {preview.data.warnings.length > 0 ? (
              <InlineNotice tone="info" icon={Info}>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {preview.data.warnings.map((warning) => (
                    <li key={warning.code}>{warningText(warning)}</li>
                  ))}
                </ul>
              </InlineNotice>
            ) : (
              <InlineNotice tone="success" icon={CircleCheck}>
                {t("items.preview.exact")}
              </InlineNotice>
            )}
            <pre
              data-selectable
              className="max-h-[50vh] overflow-auto rounded-lg border bg-card p-3 font-mono text-xs leading-5 whitespace-pre-wrap"
            >
              <HighlightedCode
                code={preview.data.content}
                language={languageOfPath(preview.data.path)}
              />
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
