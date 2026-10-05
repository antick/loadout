import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { apiMutationOptions } from "@/hooks/use-api-mutation";
import { keys } from "@/lib/query-keys";
import { dismissDuplicateOptions } from "./duplicate-mutations";

vi.mock("@/lib/api", () => ({
  api: { duplicates: { dismiss: async () => undefined, undismiss: async () => undefined } },
}));
vi.mock("@/lib/toast", () => ({ toastError: () => undefined, toastSuccess: () => undefined }));

describe("dismissing a pair of possible duplicates", () => {
  it("asks for the pairs again, and leaves the skills alone", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(keys.skills.all, []);
    queryClient.setQueryData(keys.duplicates.find(false, false), { pairs: [] });
    const observer = new MutationObserver(
      queryClient,
      apiMutationOptions(queryClient, dismissDuplicateOptions),
    );

    await observer.mutate({ idA: "a", idB: "b", dismissed: true });

    expect(queryClient.getQueryState(keys.duplicates.find(false, false))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.skills.all)?.isInvalidated).toBe(false);
  });

  it("keeps the pairs out of the skills' keys, so a skill change elsewhere does not touch them", () => {
    const [namespace] = keys.duplicates.find(true, true);
    expect(namespace).not.toBe(keys.skills.root[0]);
  });
});
