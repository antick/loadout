import { isNewerVersion } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestWorld, createTestWorld } from "./helpers";

describe("setting values", () => {
  let world: TestWorld;
  beforeEach(() => {
    world = createTestWorld();
  });
  afterEach(() => world.cleanup());

  it("refuses values a setting does not take, and reads a stored bad one as the default", () => {
    const { settings } = world.ctx;
    expect(() => settings.set("deployMode", "foo" as "copy")).toThrow(/symlink, copy/);
    expect(() => settings.set("autoUpdateInterval", "5m" as "1h")).toThrow();
    expect(() => settings.set("updateCheckTtlMinutes", -5)).toThrow();
    settings.set("deployMode", "copy");
    expect(settings.get("deployMode")).toBe("copy");

    settings.setRaw("autoUpdateInterval", "5m");
    expect(settings.get("autoUpdateInterval")).toBe("off");
    settings.setRaw("updateCheckTtlMinutes", Number.NaN);
    expect(settings.get("updateCheckTtlMinutes")).toBe(60);
  });
});

describe("version order", () => {
  it("puts a pre-release before its release", () => {
    expect(isNewerVersion("1.2.3-rc.1", "1.2.3")).toBe(false);
    expect(isNewerVersion("1.2.3", "1.2.3-rc.1")).toBe(true);
    expect(isNewerVersion("1.2.3-rc.2", "1.2.3-rc.1")).toBe(true);
    expect(isNewerVersion("1.2.3-rc.10", "1.2.3-rc.9")).toBe(true);
    expect(isNewerVersion("1.2.4-beta", "1.2.3")).toBe(true);
    expect(isNewerVersion("v0.2.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.2.1", "0.2.1")).toBe(false);
  });
});
