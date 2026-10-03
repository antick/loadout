import { API_NAMESPACES, CORE_NAMESPACES } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { tempDir, createTestCore } from "./helpers";

describe("API namespaces", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    core = createTestCore({
      homeDir: temp.dir,
    });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  // The desktop IPC bridge refuses any namespace missing from this list.
  it("names every service core builds", () => {
    expect([...CORE_NAMESPACES].sort()).toEqual(Object.keys(core.api).sort());
    expect(API_NAMESPACES).toContain("safety");
    expect(API_NAMESPACES).toContain("app");
  });
});
