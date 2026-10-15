import { describe, expect, it } from "vitest";
import { joinInFlight } from "./use-editor-session";

describe("joinInFlight", () => {
  it("runs once for a key already in flight and starts afresh once it settled", async () => {
    const running = new Map<string, Promise<number>>();
    let runs = 0;
    const start = async (): Promise<number> => {
      runs += 1;
      return runs;
    };
    const first = joinInFlight(running, "SKILL.md", start);
    const second = joinInFlight(running, "SKILL.md", start);
    expect(second).toBe(first);
    expect(await Promise.all([first, second])).toEqual([1, 1]);
    expect(running.size).toBe(0);
    expect(await joinInFlight(running, "SKILL.md", start)).toBe(2);
  });

  it("keeps other keys apart and forgets a run that failed", async () => {
    const running = new Map<string, Promise<string>>();
    const failing = joinInFlight(running, "a.md", async () => {
      throw new Error("disk full");
    });
    const other = joinInFlight(running, "b.md", async () => "b");
    await expect(failing).rejects.toThrow("disk full");
    expect(await other).toBe("b");
    expect(running.size).toBe(0);
  });
});
