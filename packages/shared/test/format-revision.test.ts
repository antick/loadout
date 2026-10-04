import { formatRevision } from "@loadout/shared";
import { describe, expect, it } from "vitest";

describe("formatRevision", () => {
  it("shortens a commit id the way Git does and leaves a version whole", () => {
    expect(formatRevision("4f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39")).toBe("4f2a9c1");
    expect(formatRevision("a".repeat(64))).toBe("aaaaaaa");
    expect(formatRevision("1.10.12")).toBe("1.10.12");
    expect(formatRevision("main")).toBe("main");
  });
});
