import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { runWithUndo, toastBatchOutcome } from "@/lib/batch";
import { TOAST_MAX_CONFLICT_PATHS } from "@/lib/constants";
import { FAILURE_LIST_CLASS } from "@/lib/toast";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

describe("toastBatchOutcome", () => {
  it("caps the failures listed and keeps the Undo and the extra line", () => {
    const undo = { label: "Undo", onClick: () => undefined };
    const failed = Array.from({ length: TOAST_MAX_CONFLICT_PATHS + 2 }, (_, index) => ({
      name: `skill-${index}`,
      message: "in use",
    }));
    toastBatchOutcome("Removed 1 skill", failed, { action: undo, description: "Kept for 7 days." });

    expect(toast.warning).toHaveBeenCalledWith(`Removed 1 skill, ${failed.length} failed`, {
      description: [
        ...failed.slice(0, TOAST_MAX_CONFLICT_PATHS).map((entry) => `${entry.name}: in use`),
        "and 2 more",
        "Kept for 7 days.",
      ].join("\n"),
      descriptionClassName: FAILURE_LIST_CLASS,
      action: undo,
    });
  });
});

describe("runWithUndo", () => {
  it("runs every job, counts what failed and offers one Undo for all that was set aside", async () => {
    vi.mocked(toast.warning).mockClear();
    const result = await runWithUndo(
      ["a", "b", "c"],
      (name) => name,
      async (name) => {
        if (name === "b") throw new Error("in use");
        return [`${name}-removed`];
      },
      (count) => `Deleted ${count}`,
    );

    expect(result).toEqual({ succeeded: 2, failed: [{ name: "b", message: "in use" }] });
    expect(toast.warning).toHaveBeenCalledWith(
      "Deleted 2, 1 failed",
      expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }),
    );
  });
});

describe("runWithUndo with one item", () => {
  it("toasts it as the single action, with the note on what was kept", async () => {
    vi.mocked(toast.success).mockClear();
    await runWithUndo(
      ["a"],
      (name) => name,
      async () => ["a-removed"],
      () => "Deleted “a”",
    );

    expect(toast.success).toHaveBeenCalledWith(
      "Deleted “a”",
      expect.objectContaining({
        description: expect.stringContaining("Recently removed"),
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("rejects with the failure instead of collecting it", async () => {
    await expect(
      runWithUndo(
        ["a"],
        (name) => name,
        async () => {
          throw new Error("in use");
        },
        () => "Deleted",
      ),
    ).rejects.toThrow("in use");
  });
});
