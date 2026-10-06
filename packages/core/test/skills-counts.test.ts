import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestWorld, createTestWorld, makeSkill } from "./helpers";
import { hashDir } from "../src/util/hash";

describe("skill counts", () => {
  let world: TestWorld;
  beforeEach(() => {
    world = createTestWorld();
  });
  afterEach(() => world.cleanup());

  const add = (name: string, updateStatus: "local_only" | "update_available") => {
    const libraryPath = makeSkill(world.ctx.paths.skillsDir, name);
    world.store.insert({
      name,
      description: null,
      sourceType: "local",
      libraryPath,
      contentHash: hashDir(libraryPath),
      updateStatus,
    });
  };

  it("counts every skill and the ones with an update, without reading them", () => {
    expect(world.store.counts()).toEqual({ total: 0, updatesAvailable: 0 });
    add("a", "local_only");
    add("b", "update_available");
    add("c", "update_available");
    expect(world.store.counts()).toEqual({ total: 3, updatesAvailable: 2 });
  });
});
