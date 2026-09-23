import { describe, expect, it, vi } from "vitest";
import { type SkillAction, splitActions } from "./skill-action";

const Icon = (() => null) as unknown as SkillAction["icon"];
const action = (id: string, destructive = false): SkillAction => ({
  id,
  label: id,
  icon: Icon,
  run: vi.fn(),
  destructive,
});

describe("splitActions", () => {
  it("keeps destructive actions apart, in order", () => {
    const { safe, destructive } = splitActions([action("a"), action("delete", true), action("b")]);
    expect(safe.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(destructive.map((entry) => entry.id)).toEqual(["delete"]);
  });
});
