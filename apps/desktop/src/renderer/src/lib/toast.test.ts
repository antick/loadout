import { ApiError } from "@loadout/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toastError } from "@/lib/toast";

const shown = vi.hoisted(() => ({ calls: [] as { title: string; description?: string }[] }));

vi.mock("sonner", () => ({
  toast: {
    error: (title: string, options?: { description?: string }) =>
      shown.calls.push({ title, description: options?.description }),
  },
}));

afterEach(() => {
  shown.calls = [];
});

describe("toastError", () => {
  it("titles the toast with what failed and puts the error's own message under it", () => {
    toastError(new Error("EACCES: permission denied"), "editor.errors.save");
    expect(shown.calls).toEqual([
      { title: "Could not save the file.", description: "EACCES: permission denied" },
    ]);
  });

  it("uses the message as the title when the caller says nothing about what failed", () => {
    toastError(new Error("Something broke"));
    expect(shown.calls).toEqual([{ title: "Something broke", description: undefined }]);
  });

  it("does not repeat the title when the error has no message of its own", () => {
    toastError(new Error(""), "editor.errors.save");
    expect(shown.calls).toEqual([{ title: "Could not save the file.", description: undefined }]);
  });

  it("still lists the folders in the way after the message", () => {
    const error = new ApiError({
      code: "TARGET_CONFLICT",
      message: "Folders are in the way",
      details: { conflicts: [{ path: "/home/me/.codex/skills/pdf", reason: "not ours" }] },
    });
    toastError(error, "errors.deploy");
    expect(shown.calls[0]?.description).toBe("Folders are in the way\n/home/me/.codex/skills/pdf");
  });

  it("stays quiet for a cancelled call", () => {
    toastError(new ApiError({ code: "CANCELLED", message: "Cancelled" }), "errors.deploy");
    expect(shown.calls).toEqual([]);
  });
});
