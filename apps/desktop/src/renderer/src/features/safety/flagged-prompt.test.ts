import { ApiError } from "@loadout/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DECLINED,
  getFlaggedPrompt,
  runWithRiskConsent,
  subscribeFlaggedPrompt,
} from "@/features/safety/flagged-prompt";

const shown = vi.hoisted(() => ({ info: [] as string[] }));
vi.mock("sonner", () => ({ toast: { info: (message: string) => shown.info.push(message) } }));

afterEach(() => {
  shown.info = [];
});

const unsafe = (): Promise<never> =>
  Promise.reject(new ApiError({ code: "UNSAFE", message: "Flagged", details: { flagged: [] } }));

const offline = (): Promise<never> => Promise.reject(new Error("offline"));

/** Answer the next question the way a user would. */
function answerNext(install: boolean): void {
  const stop = subscribeFlaggedPrompt(() => {
    const prompt = getFlaggedPrompt();
    if (!prompt) return;
    stop();
    prompt.answer(install);
  });
}

describe("runWithRiskConsent", () => {
  it("runs again accepting the risk after a yes", async () => {
    answerNext(true);
    const again = vi.fn(async () => "installed");
    await expect(runWithRiskConsent(unsafe, again, { declined: "Not installed" })).resolves.toBe(
      "installed",
    );
    expect(again).toHaveBeenCalledOnce();
    expect(shown.info).toEqual([]);
  });

  it("says what did not happen after a no, and does not run again", async () => {
    answerNext(false);
    const again = vi.fn(async () => "installed");
    await expect(
      runWithRiskConsent(unsafe, again, { action: "update", declined: "Not updated" }),
    ).resolves.toBe(DECLINED);
    expect(again).not.toHaveBeenCalled();
    expect(shown.info).toEqual(["Not updated"]);
  });

  it("passes other failures through without asking", async () => {
    await expect(
      runWithRiskConsent(offline, async () => "never", { declined: "Not installed" }),
    ).rejects.toThrow("offline");
    expect(getFlaggedPrompt()).toBeNull();
  });
});
