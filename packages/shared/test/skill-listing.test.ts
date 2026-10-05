import {
  LISTING_ENTRY_OVERHEAD,
  LISTING_MAX_DESCRIPTION_CHARS,
  type ListingSkillInput,
  biggestListed,
  listingBudgetOf,
  listingEntryOf,
  summarizeListing,
} from "@loadout/shared";
import { describe, expect, it } from "vitest";

function input(extra: Partial<ListingSkillInput> = {}): ListingSkillInput {
  return {
    name: "review",
    path: "/skills/review",
    origin: "folder",
    description: "Reviews code.",
    whenToUse: "",
    manualOnly: false,
    override: null,
    ...extra,
  };
}

/** The text after the name, as the entry's cost shows it: its length, and whether it was cut. */
function listingText(
  description: string,
  whenToUse: string,
  maxChars: number,
): { length: number; cut: boolean } {
  const entry = listingEntryOf(input({ description, whenToUse }), maxChars);
  return { length: entry.chars - "review".length - LISTING_ENTRY_OVERHEAD, cut: entry.cut };
}

/** How the entry is listed: its mode, and what hid it. */
function listingModeOf(skill: ListingSkillInput): { mode: string; hiddenBy?: string } {
  const entry = listingEntryOf(skill, LISTING_MAX_DESCRIPTION_CHARS);
  return entry.hiddenBy ? { mode: entry.mode, hiddenBy: entry.hiddenBy } : { mode: entry.mode };
}

describe("skill listing: text", () => {
  it("joins the description and when_to_use", () => {
    expect(listingText("Reviews code.", "Use for PRs.", 100)).toEqual({
      length: "Reviews code. - Use for PRs.".length,
      cut: false,
    });
    expect(listingText("Only this.", "", 100).length).toBe("Only this.".length);
  });

  it("cuts the combined text at the cap, and says so", () => {
    const { length, cut } = listingText("a".repeat(2000), "b", LISTING_MAX_DESCRIPTION_CHARS);
    expect(length).toBe(LISTING_MAX_DESCRIPTION_CHARS);
    expect(cut).toBe(true);
    expect(
      listingText("a".repeat(LISTING_MAX_DESCRIPTION_CHARS), "", LISTING_MAX_DESCRIPTION_CHARS).cut,
    ).toBe(false);
  });
});

describe("skill listing: how a skill is listed", () => {
  it("lists a plain skill in full", () => {
    expect(listingModeOf(input())).toEqual({ mode: "full" });
  });

  it("hides a skill whose frontmatter turns off model invocation", () => {
    expect(listingModeOf(input({ manualOnly: true }))).toEqual({
      mode: "hidden",
      hiddenBy: "frontmatter",
    });
  });

  it("follows the four skillOverrides states, and the override wins over the frontmatter", () => {
    expect(listingModeOf(input({ override: "name-only" }))).toEqual({ mode: "name_only" });
    expect(listingModeOf(input({ override: "user-invocable-only" }))).toEqual({
      mode: "hidden",
      hiddenBy: "override",
    });
    expect(listingModeOf(input({ override: "off" }))).toEqual({
      mode: "hidden",
      hiddenBy: "override",
    });
    expect(listingModeOf(input({ override: "on", manualOnly: true }))).toEqual({ mode: "full" });
  });

  it("ignores an override it does not know, and every override for a plugin's skill", () => {
    expect(listingModeOf(input({ override: "sideways" }))).toEqual({ mode: "full" });
    expect(listingModeOf(input({ origin: "plugin", override: "off" }))).toEqual({ mode: "full" });
  });
});

describe("skill listing: cost", () => {
  it("counts the name, the description and the fixed overhead", () => {
    const entry = listingEntryOf(input(), LISTING_MAX_DESCRIPTION_CHARS);
    expect(entry.chars).toBe("review".length + LISTING_ENTRY_OVERHEAD + "Reviews code.".length);
    expect(entry.cut).toBe(false);
  });

  it("counts only the name for name-only, and nothing for hidden", () => {
    expect(listingEntryOf(input({ override: "name-only" }), 1536).chars).toBe(
      "review".length + LISTING_ENTRY_OVERHEAD,
    );
    expect(listingEntryOf(input({ manualOnly: true }), 1536).chars).toBe(0);
  });

  it("honours a smaller cap the user set", () => {
    const entry = listingEntryOf(input({ description: "x".repeat(300) }), 100);
    expect(entry.chars).toBe("review".length + LISTING_ENTRY_OVERHEAD + 100);
    expect(entry.cut).toBe(true);
  });
});

describe("skill listing: budget", () => {
  it("is 1% of the window at four characters a token", () => {
    expect(listingBudgetOf("200k", {}).chars).toBe(8000);
    expect(listingBudgetOf("1m", {}).chars).toBe(40000);
  });

  it("takes a fixed character count first, then a fraction, then the default", () => {
    expect(listingBudgetOf("200k", { characters: 20000, fraction: 0.05 })).toEqual({
      chars: 20000,
      source: "characters",
    });
    expect(listingBudgetOf("200k", { fraction: 0.02 })).toEqual({
      chars: 16000,
      source: "fraction",
    });
    expect(listingBudgetOf("1m", {})).toEqual({ chars: 40000, source: "default" });
    expect(listingBudgetOf("200k", { characters: 0, fraction: -1 })).toEqual({
      chars: 8000,
      source: "default",
    });
  });
});

describe("skill listing: summary", () => {
  const agent = { key: "claude_code", displayName: "Claude Code" };
  const entries = [
    listingEntryOf(input({ name: "small", description: "s" }), 1536),
    listingEntryOf(input({ name: "big", description: "b".repeat(500) }), 1536),
    listingEntryOf(input({ name: "hush", manualOnly: true }), 1536),
    listingEntryOf(input({ name: "brief", override: "name-only" }), 1536),
  ];

  it("totals the cost, counts each kind and orders biggest first, hidden last", () => {
    const report = summarizeListing(agent, entries, { chars: 400, source: "default" }, "200k");
    expect(report.entries.map((entry) => entry.name)).toEqual(["big", "small", "brief", "hush"]);
    expect(report.full).toBe(2);
    expect(report.nameOnly).toBe(1);
    expect(report.hidden).toBe(1);
    expect(report.used).toBe(entries.reduce((sum, entry) => sum + entry.chars, 0));
    expect(report.over).toBe(report.used - 400);
  });

  it("is not over when it fits", () => {
    expect(summarizeListing(agent, entries, { chars: 10000, source: "default" }, "200k").over).toBe(
      0,
    );
  });

  it("names the biggest listed skills, leaving out hidden ones", () => {
    const report = summarizeListing(agent, entries, { chars: 8000, source: "default" }, "200k");
    expect(biggestListed(report, 2).map((entry) => entry.name)).toEqual(["big", "small"]);
    expect(biggestListed(report, 10).map((entry) => entry.name)).not.toContain("hush");
  });
});
