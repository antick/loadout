import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { TagPill } from "@/components/TagPill";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDeleteTag, useRenameTag } from "@/hooks/mutations/skills";
import { TAG_FILTER_UNTAGGED } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface TagFilterBarProps {
  tags: readonly string[];
  /** Selected tag names, plus `TAG_FILTER_UNTAGGED`. Empty means "All". Combined with OR. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Right-click a tag to rename or delete it everywhere. */
  manageable?: boolean;
  /** Hide the "Untagged" pill, e.g. when every listed skill has tags. */
  hideUntagged?: boolean;
  className?: string;
}

/** All / Untagged / one pill per tag. Several tags can be on at once (OR). */
export function TagFilterBar({
  tags,
  value,
  onChange,
  manageable,
  hideUntagged,
  className,
}: TagFilterBarProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (tags.length === 0) return null;

  const toggle = (tag: string): void =>
    onChange(value.includes(tag) ? value.filter((entry) => entry !== tag) : [...value, tag]);

  const askDelete = async (tag: string): Promise<void> => {
    const ok = await confirm({
      title: t("tags.deleteTitle", { tag }),
      description: t("tags.deleteDescription"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    deleteTag.mutate(tag);
    onChange(value.filter((entry) => entry !== tag));
  };

  const submitRename = (event: FormEvent): void => {
    event.preventDefault();
    const to = draft.trim();
    if (!renaming || !to || to === renaming) return;
    renameTag.mutate({ from: renaming, to });
    onChange(value.map((entry) => (entry === renaming ? to : entry)));
    setRenaming(null);
  };

  return (
    <fieldset
      aria-label={t("tags.filterLabel")}
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      <TagPill tag={t("tags.all")} active={value.length === 0} onClick={() => onChange([])} />
      {hideUntagged ? null : (
        <TagPill
          tag={t("tags.untagged")}
          active={value.includes(TAG_FILTER_UNTAGGED)}
          onClick={() => toggle(TAG_FILTER_UNTAGGED)}
        />
      )}
      {tags.map((tag) => {
        const pill = (
          <TagPill key={tag} tag={tag} active={value.includes(tag)} onClick={() => toggle(tag)} />
        );
        if (!manageable) return pill;
        return (
          <ContextMenu key={tag}>
            <ContextMenuTrigger asChild>
              <span className="inline-flex">{pill}</span>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  setDraft(tag);
                  setRenaming(tag);
                }}
              >
                {t("tags.rename")}
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" onSelect={() => void askDelete(tag)}>
                {t("tags.delete")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => (open ? undefined : setRenaming(null))}
      >
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submitRename} className="contents">
            <DialogHeader>
              <DialogTitle>{t("tags.renameTitle", { tag: renaming ?? "" })}</DialogTitle>
              <DialogDescription>{t("tags.renameDescription")}</DialogDescription>
            </DialogHeader>
            <Input
              value={draft}
              aria-label={t("tags.newName")}
              onChange={(event) => setDraft(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!draft.trim() || draft.trim() === renaming}>
                {t("tags.rename")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}
