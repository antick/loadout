import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { EDIT_ACTION_ID, type SkillAction, editOnDoubleClick, splitActions } from "./skill-action";

const Icon = (() => null) as unknown as SkillAction["icon"];
const action = (id: string, destructive = false): SkillAction => ({
  id,
  label: id,
  icon: Icon,
  run: vi.fn(),
  destructive,
});
const click = (shiftKey = false) => ({ shiftKey }) as MouseEvent;

describe("editOnDoubleClick", () => {
  it("runs the edit action", () => {
    const edit = action(EDIT_ACTION_ID);
    editOnDoubleClick([action("reveal"), edit], false)?.(click());
    expect(edit.run).toHaveBeenCalledOnce();
  });

  it("does nothing while selecting, with Shift held, or without an edit action", () => {
    const edit = action(EDIT_ACTION_ID);
    expect(editOnDoubleClick([edit], true)).toBeUndefined();
    editOnDoubleClick([edit], false)?.(click(true));
    expect(edit.run).not.toHaveBeenCalled();
    expect(editOnDoubleClick([action("reveal")], false)).toBeUndefined();
    expect(editOnDoubleClick(undefined, false)).toBeUndefined();
  });
});

describe("splitActions", () => {
  it("keeps destructive actions apart, in order", () => {
    const { safe, destructive } = splitActions([action("a"), action("delete", true), action("b")]);
    expect(safe.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(destructive.map((entry) => entry.id)).toEqual(["delete"]);
  });
});
