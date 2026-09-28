import { type ItemKind, type LibraryItem, matchesNameParts } from "@loadout/shared";
import { Bot, Download, FilePlus2, ScrollText, SquareSlash } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { SearchInput } from "@/components/SearchInput";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { useItems } from "@/hooks/queries/items";
import { ImportItemsDialog } from "./ImportItemsDialog";
import { ItemDetailSheet } from "./ItemDetailSheet";
import { NewItemDialog } from "./NewItemDialog";
import { STATE_TONES } from "./item-text";

export const KIND_ICONS = { subagent: Bot, command: SquareSlash, rule: ScrollText } as const;

/** Name or description holds the text, or the name's parts start with it (`cr` → code-review). */
function matches(item: LibraryItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const text = `${item.name} ${item.description ?? ""}`.toLowerCase();
  return needle
    .split(/\s+/)
    .every((word) => text.includes(word) || matchesNameParts(item.name, word));
}

function ItemRow({ item, onOpen }: { item: LibraryItem; onOpen: () => void }): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents().data ?? [];
  const nameOf = (key: string): string =>
    agents.find((agent) => agent.key === key)?.displayName ?? key;
  const places = [...new Set(item.deployments.map((d) => d.agentKey))].map(nameOf);
  const trouble = item.deployments.find((d) => d.state !== "in_sync");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-mono text-sm font-medium">{item.name}</span>
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {item.description ?? t("items.noDescription")}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <span>{places.length > 0 ? places.join(", ") : t("items.notDeployed")}</span>
          {trouble ? (
            <StatusBadge
              tone={STATE_TONES[trouble.state]}
              label={t(`items.agents.state.${trouble.state}`)}
            />
          ) : null}
        </div>
      </button>
    </li>
  );
}

export interface ItemsPageProps {
  kind: ItemKind;
  openName: string | null;
  onOpen: (name: string | null) => void;
}

/** One kind of item in the library: search, open one, create or import. */
export function ItemsPage({ kind, openName, onOpen }: ItemsPageProps): ReactNode {
  const { t } = useTranslation();
  const items = useItems(kind);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const shown = useMemo(
    () => (items.data ?? []).filter((item) => matches(item, query)),
    [items.data, query],
  );
  const Icon = KIND_ICONS[kind];

  return (
    <div className="flex min-h-full flex-col gap-5 px-6 py-5">
      <PageHeader
        title={t(`items.kinds.${kind}.title`)}
        subtitle={items.data ? t("items.count", { count: items.data.length }) : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              <Download />
              {t("items.import.button")}
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <FilePlus2 />
              {t("items.new")}
            </Button>
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">{t(`items.kinds.${kind}.about`)}</p>
      {items.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => void items.refetch()} className="flex-1" />
      ) : items.data.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={t(`items.kinds.${kind}.emptyTitle`)}
          description={t(`items.kinds.${kind}.emptyDescription`)}
          action={{
            label: t("items.import.button"),
            icon: Download,
            onClick: () => setImporting(true),
          }}
          className="flex-1"
        />
      ) : (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("items.search")}
            focusHotkey
            className="max-w-md"
          />
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("items.noMatches", { query })}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((item) => (
                <ItemRow key={item.name} item={item} onOpen={() => onOpen(item.name)} />
              ))}
            </ul>
          )}
        </>
      )}
      <ItemDetailSheet kind={kind} name={openName} onClose={() => onOpen(null)} />
      <NewItemDialog
        kind={kind}
        open={creating}
        onOpenChange={setCreating}
        taken={(items.data ?? []).map((item) => item.name)}
        onCreated={(name) => onOpen(name)}
      />
      <ImportItemsDialog open={importing} onOpenChange={setImporting} kind={kind} />
    </div>
  );
}
