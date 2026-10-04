import type {
  DeployItemOptions,
  FoundItem,
  ItemImportInput,
  ItemImportResult,
  ItemPlaceRef,
  ItemRef,
  ItemRemovalResult,
  ItemSource,
  LibraryItem,
  SaveItemInput,
} from "@loadout/shared";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { toastError, toastSuccess } from "@/lib/toast";

export function useCreateItem(): UseMutationResult<LibraryItem, unknown, ItemRef> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (ref: ItemRef) => api.items.create(ref),
    onSuccess: (item) => toastSuccess(t("items.created", { name: item.name })),
    onError: (error) => toastError(error, "items.errors.create"),
  });
}

export interface SaveItemVariables {
  ref: ItemRef;
  input: SaveItemInput;
}

/** No error toast: the editor answers CHANGED_ON_DISK itself. */
export function useSaveItem(): UseMutationResult<LibraryItem, unknown, SaveItemVariables> {
  return useMutation({
    mutationFn: ({ ref, input }: SaveItemVariables) => api.items.save(ref, input),
  });
}

/** Files edited in an agent's folder stay there; say which. */
function removalToast(result: ItemRemovalResult): void {
  if (result.kept.length > 0) {
    toastSuccess(i18n.t("items.keptEdited", { count: result.kept.length }), result.kept.join("\n"));
  }
}

export function useRemoveItem(): UseMutationResult<ItemRemovalResult, unknown, ItemRef> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (ref: ItemRef) => api.items.remove(ref),
    onSuccess: (result, ref) => {
      toastSuccess(t("items.deleted", { name: ref.name }));
      removalToast(result);
    },
    onError: (error) => toastError(error, "items.errors.delete"),
  });
}

export interface PlaceVariables {
  ref: ItemRef;
  place: ItemPlaceRef;
  options?: DeployItemOptions;
}

/** No error toast: a TARGET_CONFLICT is a question for the user, asked by the caller. */
export function useDeployItem(): UseMutationResult<LibraryItem, unknown, PlaceVariables> {
  return useMutation({
    mutationFn: ({ ref, place, options }: PlaceVariables) => api.items.deploy(ref, place, options),
  });
}

export function useUndeployItem(): UseMutationResult<ItemRemovalResult, unknown, PlaceVariables> {
  return useMutation({
    mutationFn: ({ ref, place }: PlaceVariables) => api.items.undeploy(ref, place),
    onSuccess: (result) => removalToast(result),
    onError: (error) => toastError(error, "items.errors.undeploy"),
  });
}

/** Looking for items is a mutation: it reads the disk or the network once, on request. */
export function useFindItems(): UseMutationResult<FoundItem[], unknown, ItemSource> {
  return useMutation({
    mutationFn: (source: ItemSource) => api.items.find(source),
    onError: (error) => toastError(error, "items.errors.find"),
  });
}

export interface ImportVariables {
  items: ItemImportInput[];
  replace: boolean;
}

export function useImportItems(): UseMutationResult<ItemImportResult, unknown, ImportVariables> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ items, replace }: ImportVariables) => api.items.importItems(items, { replace }),
    onSuccess: (result) =>
      toastSuccess(
        t("items.import.done", { count: result.imported.length + result.replaced.length }),
        result.skipped.length > 0
          ? t("items.import.skipped", { count: result.skipped.length })
          : undefined,
      ),
    onError: (error) => toastError(error, "items.errors.import"),
  });
}
