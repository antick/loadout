import { type ItemKind, isItemKind } from "@loadout/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ItemsPage } from "@/features/items/ItemsPage";

export interface ItemsSearch {
  /** Name of the item whose detail is open. */
  item?: string;
}

function ItemsRoute(): ReactNode {
  const { kind } = Route.useParams();
  const { item } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ItemsPage
      key={kind}
      kind={kind as ItemKind}
      openName={item ?? null}
      onOpen={(name) => void navigate({ search: { item: name ?? undefined } })}
    />
  );
}

export const Route = createFileRoute("/items/$kind")({
  validateSearch: (search: Record<string, unknown>): ItemsSearch => ({
    item: typeof search.item === "string" ? search.item : undefined,
  }),
  beforeLoad: ({ params }) => {
    if (!isItemKind(params.kind)) throw notFound();
  },
  component: ItemsRoute,
});
