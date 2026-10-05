import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { toastBatchOutcome } from "@/lib/batch";
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
