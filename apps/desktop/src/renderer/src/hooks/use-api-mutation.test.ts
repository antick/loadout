import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiMutationOptions, apiMutationOptions } from "./use-api-mutation";

const toast = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@/lib/toast", () => ({
  toastError: (_error: unknown, key: string) => toast.calls.push(`error:${key}`),
  toastSuccess: (message: string, description?: string) =>
    toast.calls.push(`success:${message}${description ? `/${description}` : ""}`),
}));

afterEach(() => {
  toast.calls = [];
});

/** Run one mutation through the real observer; resolves to its result or rejection. */
async function run<TData, TVariables>(
  options: ApiMutationOptions<TData, TVariables, unknown>,
  variables: TVariables,
  queryClient = new QueryClient(),
): Promise<TData | Error> {
  const observer = new MutationObserver(queryClient, apiMutationOptions(queryClient, options));
  return observer.mutate(variables).catch((error: Error) => error);
}

describe("useApiMutation options", () => {
  it("toasts the success message, with a description when given", async () => {
    await run({ fn: async (n: number) => n * 2, error: "k", success: (data) => `got ${data}` }, 2);
    await run(
      { fn: async () => 1, error: "k", success: () => ({ message: "m", description: "d" }) },
      undefined,
    );
    expect(toast.calls).toEqual(["success:got 4", "success:m/d"]);
  });

  it("runs the caller's onError (a rollback) before the error toast", async () => {
    const order: string[] = [];
    const failed = await run(
      {
        fn: async () => {
          throw new Error("no");
        },
        error: "errors.save",
        onError: () => void order.push(`rollback, toasts so far: ${toast.calls.length}`),
      },
      undefined,
    );
    expect(failed).toBeInstanceOf(Error);
    expect(order).toEqual(["rollback, toasts so far: 0"]);
    expect(toast.calls).toEqual(["error:errors.save"]);
  });

  it("stays quiet on failure when the caller shows errors itself", async () => {
    await run(
      {
        fn: async () => {
          throw new Error("no");
        },
        error: false,
      },
      undefined,
    );
    expect(toast.calls).toEqual([]);
  });

  it("refetches the keys to invalidate, success or not, before the mutation finishes", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await run(
      { fn: async (id: string) => id, error: false, invalidate: (id) => [["a", id], ["b"]] },
      "x",
      queryClient,
    );
    await run(
      {
        fn: async () => {
          throw new Error("no");
        },
        error: false,
        invalidate: [["c"]],
      },
      undefined,
      queryClient,
    );
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["a", "x"],
      ["b"],
      ["c"],
    ]);
  });
});
