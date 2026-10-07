import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import { undoAction } from "@/lib/removed-undo";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", () => ({
  api: {
    storage: {
      removed: vi.fn(async () => [
        { id: "a", name: "alpha" },
        { id: "b", name: "beta" },
        { id: "c", name: "gamma" },
      ]),
      restoreRemoved: vi.fn(async (id: string) => {
        if (id === "b") throw new Error("its place is taken");
        return { path: id, displacedId: null };
      }),
    },
  },
}));

describe("Undo of folders set aside", () => {
  it("puts back every folder it can and names the ones it could not", async () => {
    undoAction(["a", "b", "c"])?.onClick();

    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(vi.mocked(api.storage.restoreRemoved).mock.calls.map(([id]) => id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(toast.warning).toHaveBeenCalledWith(
      "Put 2 folders back, 1 failed",
      expect.objectContaining({ description: "beta: its place is taken" }),
    );
  });
});
