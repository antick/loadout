import { describe, expect, it } from "vitest";
import { eachItem } from "../src/commands/support";

describe("eachItem", () => {
  it("keeps going past a failure and names it", async () => {
    const seen: number[] = [];
    const result = await eachItem(
      [1, 2, 3],
      (n) => `item ${n}`,
      async (n) => {
        seen.push(n);
        if (n === 2) throw new Error("broken");
        return n * 10;
      },
    );
    expect(seen).toEqual([1, 2, 3]);
    expect(result).toEqual({ done: [10, 30], failed: [{ name: "item 2", message: "broken" }] });
  });
});
