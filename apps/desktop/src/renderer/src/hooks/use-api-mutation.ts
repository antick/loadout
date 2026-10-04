import {
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toastError, toastSuccess } from "@/lib/toast";

/** What a finished call says in its toast. */
export type SuccessToast = string | { message: string; description?: string };

export interface ApiMutationOptions<TData, TVariables, TContext> extends Omit<
  UseMutationOptions<TData, unknown, TVariables, TContext>,
  "mutationFn"
> {
  /** The backend call. */
  fn: (variables: TVariables) => Promise<TData>;
  /** i18n key of the error toast's fallback message; false when the caller shows errors itself. */
  error: string | false;
  /** The success toast; nothing (or no callback) stays quiet. */
  success?: (data: TData, variables: TVariables) => SuccessToast | null | undefined;
  /**
   * Keys to refetch once the call settles, waited for before the mutation finishes. Only keys no
   * `data:changed` scope covers: the main process refreshes everything else after a change.
   */
  invalidate?: readonly QueryKey[] | ((variables: TVariables) => readonly QueryKey[]);
}

/** The `useMutation` options behind `useApiMutation`. */
export function apiMutationOptions<TData, TVariables, TContext>(
  queryClient: QueryClient,
  {
    fn,
    error,
    success,
    invalidate,
    onSuccess,
    onError,
    onSettled,
    ...options
  }: ApiMutationOptions<TData, TVariables, TContext>,
): UseMutationOptions<TData, unknown, TVariables, TContext> {
  return {
    ...options,
    mutationFn: fn,
    onSuccess: (...args) => {
      const toast = success?.(args[0], args[1]);
      if (typeof toast === "string") toastSuccess(toast);
      else if (toast) toastSuccess(toast.message, toast.description);
      return onSuccess?.(...args);
    },
    onError: (...args) => {
      const result = onError?.(...args);
      if (error !== false) toastError(args[0], error);
      return result;
    },
    onSettled: (...args) => {
      const own = onSettled?.(...args);
      const queryKeys = typeof invalidate === "function" ? invalidate(args[2]) : invalidate;
      if (!queryKeys) return own;
      return Promise.all([
        own,
        ...queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ]);
    },
  };
}

/**
 * `useMutation` for one backend call: toasts the failure (after the caller's own `onError`, such
 * as an optimistic rollback), toasts `success`, and refetches `invalidate`. Other options pass
 * through unchanged.
 */
export function useApiMutation<TData, TVariables = void, TContext = unknown>(
  options: ApiMutationOptions<TData, TVariables, TContext>,
): UseMutationResult<TData, unknown, TVariables, TContext> {
  return useMutation(apiMutationOptions(useQueryClient(), options));
}
