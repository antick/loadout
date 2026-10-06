import { describe, expect, it } from "vitest";
import { CLOSE_QUESTION, closeChoice, closeOutcome, shouldReloadPage } from "./close-request";

describe("closeOutcome", () => {
  it("closes when there is no tray to hide to, whatever the setting", () => {
    for (const closeAction of ["ask", "hide", "quit"] as const) {
      expect(closeOutcome({ trayVisible: false, closeAction })).toBe("close");
    }
  });

  it("follows the saved choice", () => {
    expect(closeOutcome({ trayVisible: true, closeAction: "quit" })).toBe("close");
    expect(closeOutcome({ trayVisible: true, closeAction: "hide" })).toBe("hide");
    expect(closeOutcome({ trayVisible: true, closeAction: "ask" })).toBe("ask");
  });
});

describe("the close question", () => {
  it("maps each button to its choice, and Cancel (or Escape) to staying open", () => {
    const buttons = CLOSE_QUESTION.buttons ?? [];
    expect(buttons.map((_, index) => closeChoice(index))).toEqual(["hide", "quit", null]);
    expect(closeChoice(CLOSE_QUESTION.cancelId ?? -1)).toBeNull();
  });
});

describe("shouldReloadPage", () => {
  const MIN_MS = 10_000;

  it("reloads a page that crashed", () => {
    expect(shouldReloadPage("crashed", null, 1000, MIN_MS)).toBe(true);
    expect(shouldReloadPage("oom", 0, MIN_MS, MIN_MS)).toBe(true);
  });

  it("leaves a page that exited on purpose", () => {
    expect(shouldReloadPage("clean-exit", null, 1000, MIN_MS)).toBe(false);
  });

  it("stops reloading a page that dies again right after loading", () => {
    expect(shouldReloadPage("crashed", 5000, 5000 + MIN_MS - 1, MIN_MS)).toBe(false);
  });
});
