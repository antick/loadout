import { describe, expect, it } from "vitest";
import { isSidebarSection, sectionForPath } from "./sections";

describe("sidebar sections", () => {
  it("maps every page to the section that lists it", () => {
    expect(sectionForPath("/library")).toBe("library");
    expect(sectionForPath("/library/abc/edit")).toBe("library");
    expect(sectionForPath("/install")).toBe("library");
    expect(sectionForPath("/agents")).toBe("agents");
    expect(sectionForPath("/agents/codex")).toBe("agents");
    expect(sectionForPath("/presets/p1")).toBe("presets");
    expect(sectionForPath("/projects/x")).toBe("projects");
  });

  it("gives home and settings their own sections, and leaves backup alone", () => {
    expect(sectionForPath("/")).toBe("home");
    expect(sectionForPath("/settings")).toBe("settings");
    expect(sectionForPath("/backup")).toBeNull();
  });

  it("recognises stored section names", () => {
    expect(isSidebarSection("agents")).toBe(true);
    expect(isSidebarSection("dashboard")).toBe(false);
    expect(isSidebarSection(null)).toBe(false);
  });
});
