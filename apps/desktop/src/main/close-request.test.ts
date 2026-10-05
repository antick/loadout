import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOutcome, createCloseRequests, shouldReloadPage } from "./close-request";

const TIMEOUT_MS = 2000;

describe("closeOutcome", () => {
  it("closes when there is no tray to hide to, whatever the setting", () => {
    for (const closeAction of ["ask", "hide", "quit"] as const) {
      expect(closeOutcome({ trayVisible: false, closeAction, rendererAlive: true })).toBe("close");
    }
  });

  it("follows the saved choice", () => {
    expect(closeOutcome({ trayVisible: true, closeAction: "quit", rendererAlive: true })).toBe(
      "close",
    );
    expect(closeOutcome({ trayVisible: true, closeAction: "hide", rendererAlive: true })).toBe(
      "hide",
    );
    expect(closeOutcome({ trayVisible: true, closeAction: "ask", rendererAlive: true })).toBe(
      "ask",
    );
  });

  it("hides instead of asking a page that is gone", () => {
    expect(closeOutcome({ trayVisible: true, closeAction: "ask", rendererAlive: false })).toBe(
      "hide",
    );
  });
});

describe("createCloseRequests", () => {
  let sent: number;
  let fellBack: number;
  const requests = () =>
    createCloseRequests({
      send: () => (sent += 1),
      fallback: () => (fellBack += 1),
      timeoutMs: TIMEOUT_MS,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    sent = 0;
    fellBack = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("leaves the decision to the page once it acknowledges", () => {
    const close = requests();
    close.ask();
    expect(sent).toBe(1);
    expect(close.acknowledge()).toBe(true);
    vi.advanceTimersByTime(TIMEOUT_MS * 2);
    expect(fellBack).toBe(0);
  });

  it("falls back when the page never answers", () => {
    const close = requests();
    close.ask();
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(fellBack).toBe(0);
    vi.advanceTimersByTime(1);
    expect(fellBack).toBe(1);
    // Too late: the page must not show the question any more.
    expect(close.acknowledge()).toBe(false);
  });

  it("does not give a stuck page more time when the button is pressed again", () => {
    const close = requests();
    close.ask();
    vi.advanceTimersByTime(TIMEOUT_MS / 2);
    close.ask();
    expect(sent).toBe(1);
    vi.advanceTimersByTime(TIMEOUT_MS / 2);
    expect(fellBack).toBe(1);
  });

  it("asks again after an earlier question was settled", () => {
    const close = requests();
    close.ask();
    close.acknowledge();
    close.ask();
    expect(sent).toBe(2);
  });

  it("drops a question in flight when cancelled", () => {
    const close = requests();
    close.ask();
    close.cancel();
    vi.advanceTimersByTime(TIMEOUT_MS * 2);
    expect(fellBack).toBe(0);
    expect(close.acknowledge()).toBe(false);
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
