import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The browser preview answers every channel the renderer calls. A missing one shows up only as
 * a broken screen in the preview, so it is checked here, by reading the source.
 */
const RENDERER = join(import.meta.dirname, "..", "src", "renderer", "src");
const QUIET = "lib/dev-mock-quiet.ts";
const CALL = /\bapi\.([a-zA-Z]+)\.([a-zA-Z]+)\b/g;
const FAKE = /"([a-zA-Z]+\.[a-zA-Z]+)":/g;
/** The quiet fakes are plain lists of channel names. */
const LISTED = /"([a-zA-Z]+\.[a-zA-Z]+)",/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "locales" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("the browser preview's fake API", () => {
  it("answers every channel the renderer calls", () => {
    const called = new Set<string>();
    const faked = new Set<string>();
    for (const path of sourceFiles(RENDERER)) {
      const name = relative(RENDERER, path);
      const text = readFileSync(path, "utf8");
      if (!name.startsWith("lib/dev-mock")) {
        for (const [, namespace, method] of text.matchAll(CALL))
          called.add(`${namespace}.${method}`);
        continue;
      }
      for (const [, channel = ""] of text.matchAll(name === QUIET ? LISTED : FAKE)) {
        faked.add(channel);
      }
    }
    expect([...called].filter((channel) => !faked.has(channel)).sort()).toEqual([]);
  });
});
