import type { ItemKind, LibraryItemDetail } from "@loadout/shared";
import { Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { MarkdownView } from "@/components/MarkdownView";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRemoveItem } from "@/hooks/mutations/items";
import { useItem } from "@/hooks/queries/items";
import { ItemAgentsTab } from "./ItemAgentsTab";
import { ItemEditTab } from "./ItemEditTab";

const TABS = ["document", "edit", "agents"] as const;
type Tab = (typeof TABS)[number];
const TAB_PANEL_CLASS = "min-h-0 flex-1 overflow-y-auto px-6 py-5";

function ItemDetailBody({
  item,
  onClose,
  onDirtyChange,
}: {
  item: LibraryItemDetail;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const remove = useRemoveItem();
  const [tab, setTab] = useState<Tab>("document");

  const deleteItem = async (): Promise<void> => {
    const ok = await confirm({
      title: t("items.detail.deleteTitle", { name: item.name }),
      description: t("items.detail.deleteDescription"),
      items: item.deployments.map((deployment) => deployment.path),
      confirmLabel: t("items.detail.delete"),
      destructive: true,
    });
    if (ok) remove.mutate(item, { onSuccess: onClose });
  };

  return (
    <>
      <SheetHeader className="border-b px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="truncate font-mono">{item.name}</SheetTitle>
            <SheetDescription>
              {t(`items.kinds.${item.kind}.one`)}
              {item.description ? ` · ${item.description}` : ""}
            </SheetDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void deleteItem()}
            disabled={remove.isPending}
          >
            <Trash2 />
            {t("items.detail.delete")}
          </Button>
        </div>
      </SheetHeader>
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as Tab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-b px-6 py-2">
          <TabsList>
            {TABS.map((name) => (
              <TabsTrigger key={name} value={name}>
                {t(`items.detail.tabs.${name}`)}
                {name === "agents" && item.deployments.length > 0 ? (
                  <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                    {item.deployments.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="document" className={TAB_PANEL_CLASS}>
          <div className="flex flex-col gap-4">
            <PathText path={item.path} />
            <article className="rounded-lg border bg-card p-4">
              <MarkdownView content={item.content} />
            </article>
          </div>
        </TabsContent>
        {/* Kept mounted while another tab shows, so unsaved text survives a look elsewhere. */}
        <TabsContent
          value="edit"
          forceMount
          className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <ItemEditTab item={item} onDirtyChange={onDirtyChange} />
        </TabsContent>
        <TabsContent value="agents" className={TAB_PANEL_CLASS}>
          <ItemAgentsTab item={item} />
        </TabsContent>
      </Tabs>
    </>
  );
}

export interface ItemDetailSheetProps {
  kind: ItemKind;
  /** Null keeps the panel closed. */
  name: string | null;
  onClose: () => void;
}

/** Wide panel on the right with one item: its text, an editor, and where it is deployed. */
export function ItemDetailSheet({ kind, name, onClose }: ItemDetailSheetProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  // Keep the last item on screen while the panel slides out.
  const [shown, setShown] = useState(name);
  if (name !== null && name !== shown) setShown(name);
  const item = useItem(shown === null ? null : { kind, name: shown });
  const dirty = useRef(false);
  const setDirty = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);

  /** Closing with unsaved edits asks first. */
  const close = async (): Promise<void> => {
    if (dirty.current) {
      const discard = await confirm({
        title: t("items.detail.discardTitle", { name: shown ?? "" }),
        description: t("items.detail.discardDescription"),
        confirmLabel: t("items.detail.discard"),
        destructive: true,
      });
      if (!discard) return;
    }
    dirty.current = false;
    onClose();
  };

  return (
    <Sheet open={name !== null} onOpenChange={(open) => (open ? undefined : void close())}>
      <SheetContent
        className="flex w-full flex-col gap-0 sm:max-w-3xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        {item.data ? (
          <ItemDetailBody
            key={`${item.data.kind}/${item.data.name}`}
            item={item.data}
            onClose={onClose}
            onDirtyChange={setDirty}
          />
        ) : (
          <>
            <SheetHeader className="border-b px-6 pt-5 pb-4">
              <SheetTitle className="font-mono">{shown}</SheetTitle>
              <SheetDescription>{item.isError ? t("items.detail.missing") : null}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 px-6 py-5">
              {item.isError ? (
                <ErrorState error={item.error} onRetry={() => void item.refetch()} />
              ) : (
                <Skeleton className="h-40 w-full" />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
