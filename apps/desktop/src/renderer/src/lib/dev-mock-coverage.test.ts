import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createQuietMockHandlers } from "./dev-mock-quiet";

/**
 * The browser preview answers every channel the renderer calls. A missing one shows up only as
 * a broken screen in the preview, so it is checked here, by reading the source.
 */
const RENDERER = join(__dirname, "..");
const CALL = /\bapi\.([a-zA-Z]+)\.([a-zA-Z]+)\b/g;
const FAKE = /"([a-zA-Z]+\.[a-zA-Z]+)":/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "locales" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("the browser preview's fake API", () => {
  it("answers every channel the renderer calls", () => {
    const files = sourceFiles(RENDERER);
    const isMock = (path: string): boolean => relative(RENDERER, path).startsWith("lib/dev-mock");
    const called = new Set<string>();
    const faked = new Set<string>(Object.keys(createQuietMockHandlers()));
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const pattern = isMock(path) ? FAKE : CALL;
      for (const match of text.matchAll(pattern)) {
        const channel = isMock(path) ? (match[1] ?? "") : `${match[1]}.${match[2]}`;
        (isMock(path) ? faked : called).add(channel);
      }
    }
    expect([...called].filter((channel) => !faked.has(channel)).sort()).toEqual([]);
  });
});
