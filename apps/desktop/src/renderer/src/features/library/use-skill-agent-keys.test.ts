import { describe, expect, it } from "vitest";
import { blockActionKey } from "./use-skill-agent-keys";

describe("blockActionKey", () => {
  it("offers Allow whenever the skill is blocked, even while a deployment is still there", () => {
    expect(blockActionKey(true, true)).toBe("library.agents.allow");
    expect(blockActionKey(true, false)).toBe("library.agents.allow");
    expect(blockActionKey(false, true)).toBe("library.agents.blockAndRemove");
    expect(blockActionKey(false, false)).toBe("library.agents.block");
  });
});
