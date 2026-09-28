import type {
  ItemKind,
  ItemPlace,
  ItemPlaceRef,
  ItemPreview,
  ItemRef,
  LibraryItem,
  LibraryItemDetail,
} from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Library items of one kind, with where each is deployed. */
export function useItems(kind: ItemKind): UseQueryResult<LibraryItem[]> {
  return useQuery({ queryKey: keys.items.list(kind), queryFn: () => api.items.list(kind) });
}

/** Every library item, for counts. */
export function useAllItems(): UseQueryResult<LibraryItem[]> {
  return useQuery({ queryKey: keys.items.list(""), queryFn: () => api.items.list() });
}

/** One item with its text. Always read fresh, so an edit made on disk shows up. */
export function useItem(ref: ItemRef | null): UseQueryResult<LibraryItemDetail> {
  return useQuery({
    queryKey: keys.items.detail(ref?.kind ?? "", ref?.name ?? ""),
    queryFn: () => api.items.get(ref as ItemRef),
    enabled: ref !== null,
    staleTime: 0,
  });
}

/** The agents that read this kind of item. */
export function useItemPlaces(kind: ItemKind): UseQueryResult<ItemPlace[]> {
  return useQuery({ queryKey: keys.items.places(kind), queryFn: () => api.items.places(kind) });
}

/** The converted file one agent would get. */
export function useItemPreview(
  ref: ItemRef,
  place: ItemPlaceRef | null,
): UseQueryResult<ItemPreview> {
  return useQuery({
    queryKey: keys.items.preview(ref.kind, ref.name, place?.agentKey ?? "", place?.projectId ?? ""),
    queryFn: () => api.items.preview(ref, place as ItemPlaceRef),
    enabled: place !== null,
    staleTime: 0,
  });
}
