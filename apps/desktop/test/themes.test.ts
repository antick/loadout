import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PALETTES } from "@loadout/shared";
import { describe, expect, it } from "vitest";

/** The renderer's stylesheets: globals.css and one file per palette in themes/. */
const STYLES = join(import.meta.dirname, "..", "src", "renderer", "src", "styles");
const read = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");
const globals = read(join(STYLES, "globals.css"));

/** Every role a palette must set, in light and in dark. globals.css derives the rest. */
const ROLES = [
  "background",
  "foreground",
  "card",
  "popover",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "selected",
  "selected-foreground",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "rail",
  "rail-foreground",
  "rail-hover",
  "rail-active-foreground",
  "rail-selected",
  "rail-indicator",
  "rail-border",
  "kit",
  "overlay",
];

/** The declarations inside the first block whose selector is exactly `selector`. */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("}", start));
}

const missing = (body: string): string[] => ROLES.filter((role) => !body.includes(`--${role}:`));

describe.each(PALETTES)("palette %s", (palette) => {
  const css = read(join(STYLES, "themes", `${palette}.css`));

  it("has a file", () => {
    expect(css).not.toBe("");
  });

  it("sets every role in light mode", () => {
    expect(missing(block(css, `[data-theme="${palette}"]`))).toEqual([]);
  });

  it("sets every role in dark mode", () => {
    expect(missing(block(css, `[data-theme="${palette}"].dark`))).toEqual([]);
  });

  it("is imported by globals.css", () => {
    expect(globals).toContain(`@import "./themes/${palette}.css";`);
  });
});
