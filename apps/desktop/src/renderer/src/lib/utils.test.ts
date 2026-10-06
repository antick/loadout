import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps the theme's own font sizes next to a text colour", () => {
    expect(cn("text-caption", "text-muted-foreground")).toBe("text-caption text-muted-foreground");
    expect(cn("text-2xs text-primary")).toBe("text-2xs text-primary");
  });

  it("lets a later font size replace an earlier one", () => {
    expect(cn("text-page-title", "text-sm")).toBe("text-sm");
  });
});
