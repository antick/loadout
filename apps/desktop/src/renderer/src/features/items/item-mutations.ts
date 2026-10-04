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
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { toastSuccess } from "@/lib/toast";

export function useCreateItem(): UseMutationResult<LibraryItem, unknown, ItemRef> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (ref: ItemRef) => api.items.create(ref),
    success: (item) => t("items.created", { name: item.name }),
    error: "items.errors.create",
  });
}

export interface SaveItemVariables {
  ref: ItemRef;
  input: SaveItemInput;
}

/** No error toast: the editor answers CHANGED_ON_DISK itself. */
export function useSaveItem(): UseMutationResult<LibraryItem, unknown, SaveItemVariables> {
  return useApiMutation({
    fn: ({ ref, input }: SaveItemVariables) => api.items.save(ref, input),
    error: false,
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
  return useApiMutation({
    fn: (ref: ItemRef) => api.items.remove(ref),
    onSuccess: (result, ref) => {
      toastSuccess(t("items.deleted", { name: ref.name }));
      removalToast(result);
    },
    error: "items.errors.delete",
  });
}

export interface PlaceVariables {
  ref: ItemRef;
  place: ItemPlaceRef;
  options?: DeployItemOptions;
}

/** No error toast: a TARGET_CONFLICT is a question for the user, asked by the caller. */
export function useDeployItem(): UseMutationResult<LibraryItem, unknown, PlaceVariables> {
  return useApiMutation({
    fn: ({ ref, place, options }: PlaceVariables) => api.items.deploy(ref, place, options),
    error: false,
  });
}

export function useUndeployItem(): UseMutationResult<ItemRemovalResult, unknown, PlaceVariables> {
  return useApiMutation({
    fn: ({ ref, place }: PlaceVariables) => api.items.undeploy(ref, place),
    onSuccess: (result) => removalToast(result),
    error: "items.errors.undeploy",
  });
}

/** Looking for items is a mutation: it reads the disk or the network once, on request. */
export function useFindItems(): UseMutationResult<FoundItem[], unknown, ItemSource> {
  return useApiMutation({
    fn: (source: ItemSource) => api.items.find(source),
    error: "items.errors.find",
  });
}

export interface ImportVariables {
  items: ItemImportInput[];
  replace: boolean;
}

export function useImportItems(): UseMutationResult<ItemImportResult, unknown, ImportVariables> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ items, replace }: ImportVariables) => api.items.importItems(items, { replace }),
    success: (result) => ({
      message: t("items.import.done", { count: result.imported.length + result.replaced.length }),
      description:
        result.skipped.length > 0
          ? t("items.import.skipped", { count: result.skipped.length })
          : undefined,
    }),
    error: "items.errors.import",
  });
}
