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

  it("leaves pages of their own alone", () => {
    expect(sectionForPath("/")).toBeNull();
    expect(sectionForPath("/backup")).toBeNull();
    expect(sectionForPath("/settings")).toBeNull();
  });

  it("recognises stored section names", () => {
    expect(isSidebarSection("agents")).toBe(true);
    expect(isSidebarSection("dashboard")).toBe(false);
    expect(isSidebarSection(null)).toBe(false);
  });
});
