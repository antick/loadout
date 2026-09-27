import { AppError } from "@loadout/core";
import { describe, expect, it, vi } from "vitest";
import {
  UNAVAILABLE_TEXT,
  type UnavailableChoice,
  type UnavailablePrompts,
  openCoreOrAsk,
} from "./library-unavailable";

const MISSING = "/Volumes/External/loadout";

function prompts(choices: UnavailableChoice[], overrides: Partial<UnavailablePrompts> = {}) {
  return {
    ask: vi.fn(() => choices.shift() ?? "quit"),
    pickFolder: vi.fn(() => "/Volumes/Renamed/loadout"),
    isLibrary: vi.fn(() => true),
    tell: vi.fn(),
    confirmDefault: vi.fn(() => true),
    point: vi.fn(),
    ...overrides,
  } satisfies UnavailablePrompts;
}

/** Fails as the core does while the library is missing, `times` times, then opens. */
function opener(times: number) {
  let left = times;
  return vi.fn(() => {
    if (left-- > 0) {
      throw new AppError("LIBRARY_UNAVAILABLE", "not there", { path: MISSING });
    }
    return "core";
  });
}

describe("a library that cannot be found at start", () => {
  it("opens straight away when the library is there", () => {
    const ask = prompts([]);
    expect(openCoreOrAsk(opener(0), ask)).toBe("core");
    expect(ask.ask).not.toHaveBeenCalled();
  });

  it("tries again after the disk is connected", () => {
    const ask = prompts(["retry"]);
    expect(openCoreOrAsk(opener(1), ask)).toBe("core");
    expect(ask.ask).toHaveBeenCalledWith(MISSING);
    expect(ask.point).not.toHaveBeenCalled();
  });

  it("points at a library found somewhere else, and refuses a folder without one", () => {
    const refused = prompts(["choose", "quit"], { isLibrary: vi.fn(() => false) });
    expect(openCoreOrAsk(opener(5), refused)).toBeNull();
    expect(refused.tell).toHaveBeenCalledWith(
      UNAVAILABLE_TEXT.notALibrary("/Volumes/Renamed/loadout"),
    );
    expect(refused.point).not.toHaveBeenCalled();

    const found = prompts(["choose"]);
    expect(openCoreOrAsk(opener(1), found)).toBe("core");
    expect(found.point).toHaveBeenCalledWith("/Volumes/Renamed/loadout");
  });

  it("uses the default folder only when confirmed", () => {
    const declined = prompts(["default", "quit"], { confirmDefault: vi.fn(() => false) });
    expect(openCoreOrAsk(opener(5), declined)).toBeNull();
    expect(declined.point).not.toHaveBeenCalled();

    const confirmed = prompts(["default"]);
    expect(openCoreOrAsk(opener(1), confirmed)).toBe("core");
    expect(confirmed.point).toHaveBeenCalledWith(null);
  });

  it("lets any other start failure through", () => {
    const broken = vi.fn(() => {
      throw new AppError("IO", "database is locked");
    });
    expect(() => openCoreOrAsk(broken, prompts([]))).toThrow("database is locked");
  });
});
