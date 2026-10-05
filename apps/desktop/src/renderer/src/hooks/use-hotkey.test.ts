import { describe, expect, it } from "vitest";
import { matchesHotkey } from "@/hooks/use-hotkey";

const press = (key: string, held: { meta?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  code: `Key${key.toUpperCase()}`,
  metaKey: held.meta ?? false,
  ctrlKey: false,
  shiftKey: held.shift ?? false,
  altKey: held.alt ?? false,
});

describe("matchesHotkey", () => {
  it("matches ⌘K for k", () => {
    expect(matchesHotkey(press("k", { meta: true }), "k")).toBe(true);
  });

  it("does not take ⌥⌘K for ⌘K", () => {
    expect(matchesHotkey(press("k", { meta: true, alt: true }), "k")).toBe(false);
  });

  it("matches an ⌥ shortcut by physical key, whatever character ⌥ makes", () => {
    const optionE = { ...press("e", { meta: true, alt: true }), key: "´" };
    expect(matchesHotkey(optionE, "e", { alt: true })).toBe(true);
    expect(matchesHotkey(press("e", { meta: true }), "e", { alt: true })).toBe(false);
  });

  it("needs ⌘ and ⇧ exactly as asked", () => {
    expect(matchesHotkey(press("k"), "k")).toBe(false);
    expect(matchesHotkey(press("k", { meta: true, shift: true }), "k")).toBe(false);
    expect(matchesHotkey(press("k", { meta: true, shift: true }), "k", { shift: true })).toBe(true);
    expect(matchesHotkey(press("/"), "/", { mod: false })).toBe(true);
  });
});
