import { join } from "node:path";
import { API_NAMESPACES, CORE_NAMESPACES } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Core, createCore } from "../src/core";
import { silentLogger } from "../src/log";
import { tempDir } from "./helpers";

describe("API namespaces", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    core = createCore({
      homeDir: temp.dir,
      configDir: join(temp.dir, "config"),
      logger: silentLogger,
      safetyScannerPath: null,
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
