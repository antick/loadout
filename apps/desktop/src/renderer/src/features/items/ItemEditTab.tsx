import { ApiError, type LibraryItemDetail } from "@loadout/shared";
import { FileWarning, Save } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CodeEditor } from "@/features/editor/CodeEditor";
import { languageFor } from "@/features/editor/code-languages";
import { useSaveItem } from "@/hooks/mutations/items";
import { toastError, toastSuccess } from "@/lib/toast";

const MARKDOWN = languageFor("item.md");

/**
 * Edit an item's text. A save never overwrites a change made on disk meanwhile: it asks. While
 * nothing is typed, a change on disk (a sync, another editor) simply shows up.
 */
export function ItemEditTab({
  item,
  onDirtyChange,
}: {
  item: LibraryItemDetail;
  /** Told whenever there start or stop being unsaved changes. */
  onDirtyChange: (dirty: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const save = useSaveItem();
  const [draft, setDraft] = useState(item.content);
  const [base, setBase] = useState({ hash: item.hash, content: item.content });
  const [conflict, setConflict] = useState(false);
  const dirty = draft !== base.content;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // Follow the file on disk while there is nothing unsaved to lose.
  if (!dirty && item.hash !== base.hash) {
    setBase({ hash: item.hash, content: item.content });
    setDraft(item.content);
  }

  const write = (overwrite: boolean): void => {
    save.mutate(
      { ref: item, input: { content: draft, baseHash: base.hash, overwrite } },
      {
        onSuccess: (saved) => {
          setBase({ hash: saved.hash, content: draft });
          setConflict(false);
          toastSuccess(t("items.detail.saved"));
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === "CHANGED_ON_DISK") setConflict(true);
          else toastError(error, "items.errors.save");
        },
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-6 py-2 text-xs text-muted-foreground">
        <span>{dirty ? t("items.detail.unsaved") : null}</span>
        <Button size="sm" onClick={() => write(false)} disabled={!dirty || save.isPending}>
          {save.isPending ? <Spinner /> : <Save />}
          {t("items.detail.save")}
        </Button>
      </div>
      {conflict ? (
        <div className="px-6 pt-3">
          <InlineNotice
            tone="warning"
            icon={FileWarning}
            actions={
              <>
                <Button size="xs" variant="outline" onClick={() => write(true)}>
                  {t("items.detail.overwrite")}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setBase({ hash: item.hash, content: item.content });
                    setDraft(item.content);
                    setConflict(false);
                  }}
                >
                  {t("items.detail.reload")}
                </Button>
              </>
            }
          >
            {t("items.detail.changedOnDisk")}
          </InlineNotice>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <CodeEditor
          docKey={`${item.kind}/${item.name}`}
          value={draft}
          language={MARKDOWN}
          wrap
          ariaLabel={item.name}
          onChange={setDraft}
          onSave={() => (dirty ? write(false) : undefined)}
        />
      </div>
    </div>
  );
}
