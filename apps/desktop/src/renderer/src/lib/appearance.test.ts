import { describe, expect, it } from "vitest";
import { type Appearance, applyAppearance, restoreAppearance } from "@/lib/appearance";
import { APPEARANCE_STORAGE_KEY } from "@/lib/constants";

/** A `Storage` holding one saved appearance. */
function storageWith(value: string | null): Storage {
  return {
    length: value === null ? 0 : 1,
    key: () => null,
    getItem: (key) => (key === APPEARANCE_STORAGE_KEY ? value : null),
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  };
}

describe("appearance before the first paint", () => {
  it("restores the text size with the colours", () => {
    const saved: Appearance = { palette: "iris", dark: true, textSize: "large" };
    expect(restoreAppearance(storageWith(JSON.stringify(saved)))).toEqual(saved);
  });

  it("falls back to the default size when an older copy has none", () => {
    const restored = restoreAppearance(storageWith('{"palette":"iris","dark":false}'));
    expect(restored.textSize).toBe("default");
  });

  it("puts the text scale on the document", () => {
    const properties = new Map<string, string>();
    const root = {
      dataset: {} as DOMStringMap,
      classList: { toggle: () => true },
      style: {
        colorScheme: "",
        setProperty: (name: string, value: string) => properties.set(name, value),
      },
    } as unknown as HTMLElement;
    applyAppearance({ palette: "iris", dark: false, textSize: "large" }, root);
    expect(Number(properties.get("--app-text-scale"))).toBeGreaterThan(1);
  });
});
