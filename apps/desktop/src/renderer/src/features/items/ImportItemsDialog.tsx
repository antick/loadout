import { type FoundItem, type ItemKind, type ItemSource, ITEM_KINDS } from "@loadout/shared";
import { Search } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceCards } from "@/components/ChoiceCards";
import { FolderField } from "@/components/FolderField";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useFindItems, useImportItems } from "@/features/items/item-mutations";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { useWarningText } from "./item-text";

type SourceType = ItemSource["type"];
const SOURCE_TYPES: readonly SourceType[] = ["agents", "folder", "git"];
const STATUS_TONES = { new: "success", same: "neutral", differs: "warning" } as const;

const keyOf = (item: FoundItem): string => `${item.kind}/${item.name}`;

function FoundRow({
  item,
  checked,
  onChange,
}: {
  item: FoundItem;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents().data ?? [];
  const warningText = useWarningText();
  const id = useId();
  const agent = agents.find((each) => each.key === item.agentKey)?.displayName ?? item.agentKey;
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={item.status === "same"}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5"
      />
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-mono text-sm">{item.name}</span>
          <StatusBadge
            tone={STATUS_TONES[item.status]}
            label={t(`items.import.status.${item.status}`)}
          />
        </span>
        {item.description ? (
          <span className="line-clamp-1 text-xs text-muted-foreground">{item.description}</span>
        ) : null}
        <span className="truncate text-xs text-muted-foreground">
          {item.path}
          {agent ? ` · ${t("items.import.inAgent", { agent })}` : ""}
        </span>
        {item.warnings.map((warning) => (
          <span key={warning.code} className="text-xs text-warning">
            {warningText(warning)}
          </span>
        ))}
      </label>
    </li>
  );
}

function ImportForm({ kind, onClose }: { kind: ItemKind; onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const folderId = useId();
  const urlId = useId();
  const replaceId = useId();
  const find = useFindItems();
  const importItems = useImportItems();
  const [type, setType] = useState<SourceType>("agents");
  const [folder, setFolder] = useState("");
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(false);
  const found = find.data;

  const source: ItemSource | null =
    type === "agents"
      ? { type }
      : type === "folder"
        ? folder.trim()
          ? { type, path: folder.trim() }
          : null
        : url.trim()
          ? { type, url: url.trim() }
          : null;

  const look = (): void => {
    if (!source) return;
    find.mutate(source, {
      onSuccess: (items) =>
        setPicked(new Set(items.filter((item) => item.status === "new").map(keyOf))),
    });
  };

  if (found) {
    const chosen = found.filter((item) => picked.has(keyOf(item)));
    const differs = chosen.some((item) => item.status === "differs");
    // This page's kind first, then the others.
    const kinds = [kind, ...ITEM_KINDS.filter((each) => each !== kind)];
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("items.import.found", { count: found.length })}</DialogTitle>
          <DialogDescription>{t("items.import.description")}</DialogDescription>
        </DialogHeader>
        {found.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("items.import.foundNone")}</p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto">
            {kinds.map((each) => {
              const group = found.filter((item) => item.kind === each);
              if (group.length === 0) return null;
              return (
                <section key={each} className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t(`items.kinds.${each}.title`)}
                  </h3>
                  <ul className="divide-y rounded-lg border">
                    {group.map((item) => (
                      <FoundRow
                        key={keyOf(item)}
                        item={item}
                        checked={picked.has(keyOf(item))}
                        onChange={(on) => {
                          const next = new Set(picked);
                          if (on) next.add(keyOf(item));
                          else next.delete(keyOf(item));
                          setPicked(next);
                        }}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
        {differs ? (
          <div className="flex items-center gap-2">
            <Switch id={replaceId} checked={replace} onCheckedChange={setReplace} />
            <Label htmlFor={replaceId}>{t("items.import.replace")}</Label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => find.reset()}>
            {t("items.import.back")}
          </Button>
          <Button
            disabled={chosen.length === 0 || importItems.isPending}
            onClick={() =>
              importItems.mutate(
                {
                  items: chosen.map(({ kind: k, name, content }) => ({ kind: k, name, content })),
                  replace,
                },
                { onSuccess: onClose },
              )
            }
          >
            {importItems.isPending ? <Spinner /> : null}
            {t("items.import.submit", { count: chosen.length })}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("items.import.title")}</DialogTitle>
        <DialogDescription>{t("items.import.description")}</DialogDescription>
      </DialogHeader>
      <ChoiceCards
        label={t("items.import.from")}
        value={type}
        onChange={setType}
        choices={SOURCE_TYPES.map((value) => ({
          value,
          title: t(`items.import.${value}`),
          description: t(`items.import.${value}Hint`),
        }))}
      />
      {type === "folder" ? (
        <Field>
          <FieldLabel htmlFor={folderId}>{t("items.import.folder")}</FieldLabel>
          <FolderField id={folderId} value={folder} onChange={setFolder} />
        </Field>
      ) : null}
      {type === "git" ? (
        <Field>
          <FieldLabel htmlFor={urlId}>{t("items.import.url")}</FieldLabel>
          <Input
            id={urlId}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="owner/repo"
            spellCheck={false}
            autoComplete="off"
            onKeyDown={(event) => (event.key === "Enter" ? look() : undefined)}
          />
        </Field>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button disabled={!source || find.isPending} onClick={look}>
          {find.isPending ? <Spinner /> : <Search />}
          {find.isPending ? t("items.import.looking") : t("items.import.look")}
        </Button>
      </DialogFooter>
    </>
  );
}

export interface ImportItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page it opened from: its kind is listed first. */
  kind: ItemKind;
}

/** Find items in agents' folders, a folder or a repository, and copy the chosen ones in. */
export function ImportItemsDialog({ open, onOpenChange, kind }: ImportItemsDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open ? <ImportForm kind={kind} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
