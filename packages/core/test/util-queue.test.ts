import { describe, expect, it } from "vitest";
import { KeyedQueue, createSerialQueue } from "../src/util/queue";

const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("keyed queue", () => {
  it("runs work of one key in turn, and of different keys side by side", async () => {
    const queue = new KeyedQueue();
    const order: string[] = [];
    const step = (name: string, ms: number) => async (): Promise<void> => {
      order.push(`${name} start`);
      await later(ms);
      order.push(`${name} end`);
    };
    await Promise.all([
      queue.run("a", step("a1", 30)),
      queue.run("a", step("a2", 1)),
      queue.run("b", step("b1", 1)),
    ]);
    expect(order.indexOf("a2 start")).toBeGreaterThan(order.indexOf("a1 end"));
    expect(order.indexOf("b1 end")).toBeLessThan(order.indexOf("a1 end"));
  });

  it("goes on after a failure and says while a key is busy", async () => {
    const queue = new KeyedQueue();
    const failed = queue.run("a", () => Promise.reject(new Error("no")));
    const next = queue.run("a", () => "ran");
    expect(queue.busy("a")).toBe(true);
    await expect(failed).rejects.toThrow("no");
    expect(await next).toBe("ran");
    await later(0);
    expect(queue.busy("a")).toBe(false);
  });

  it("serial queue: one call at a time", async () => {
    const queue = createSerialQueue();
    let running = 0;
    let most = 0;
    await Promise.all(
      [1, 2, 3].map(() =>
        queue.run(async () => {
          running += 1;
          most = Math.max(most, running);
          await later(5);
          running -= 1;
        }),
      ),
    );
    expect(most).toBe(1);
  });
});
