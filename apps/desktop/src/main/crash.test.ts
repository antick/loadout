import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { silentLogger } from "@loadout/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCrashHandlers } from "./crash";

let dir: string;
let marker: string;
let shown: string[];
let exits: number[];
const handlers = (open = true) =>
  createCrashHandlers({
    target: () => (open ? { log: silentLogger, crashMarkerPath: marker } : null),
    showError: (message) => shown.push(message),
    exit: (code) => exits.push(code),
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crash-"));
  marker = join(dir, "crash.json");
  shown = [];
  exits = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("crash handling", () => {
  it("only logs a promise nobody waited on: no crash notice, the app keeps running", () => {
    handlers().unhandledRejection(new Error("a check that failed"));
    expect(existsSync(marker)).toBe(false);
    expect(shown).toEqual([]);
    expect(exits).toEqual([]);
  });

  it("records an uncaught exception, says so, and quits", () => {
    handlers().uncaughtException(new Error("state is broken"));
    expect(JSON.parse(readFileSync(marker, "utf8")).message).toContain("state is broken");
    expect(shown[0]).toContain("state is broken");
    expect(exits).toEqual([1]);
  });

  it("still quits when the library never opened", () => {
    handlers(false).uncaughtException(new Error("too early"));
    expect(existsSync(marker)).toBe(false);
    expect(shown[0]).toContain("too early");
    expect(exits).toEqual([1]);
  });
});
