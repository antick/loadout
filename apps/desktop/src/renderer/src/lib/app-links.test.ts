import { NEW_ISSUE_URL, RELEASES_URL } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { bugReportUrl, releaseNotesUrl } from "./app-links";

describe("releaseNotesUrl", () => {
  it("points at the tag of the version", () => {
    expect(releaseNotesUrl("0.4.2")).toBe(`${RELEASES_URL}/tag/v0.4.2`);
  });
});

describe("bugReportUrl", () => {
  it("fills in the body, keeping line breaks and symbols", () => {
    const url = new URL(bugReportUrl("Version: 1.0.0\nSystem: macOS & more"));
    expect(`${url.origin}${url.pathname}`).toBe(NEW_ISSUE_URL);
    expect(url.searchParams.get("body")).toBe("Version: 1.0.0\nSystem: macOS & more");
  });
});
