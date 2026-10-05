import type { ClawhubAccount } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { canPreviewClawhub } from "@/features/library/publish/publish-queries";

function account(handle: string | null): ClawhubAccount {
  return { available: true, saved: handle !== null, handle, problem: null };
}

describe("canPreviewClawhub", () => {
  it("waits for the account answer before asking for a preview", () => {
    expect(canPreviewClawhub(undefined)).toBe(false);
  });

  it("asks only once a token signs in", () => {
    expect(canPreviewClawhub(account(null))).toBe(false);
    expect(canPreviewClawhub(account("ada"))).toBe(true);
  });
});
