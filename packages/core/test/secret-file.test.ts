import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "../src/errors";
import { createFileSecretStore } from "../src/secret-file";
import { tempDir } from "./helpers";

describe("createFileSecretStore", () => {
  let temp: ReturnType<typeof tempDir>;
  let file: string;
  beforeEach(() => {
    temp = tempDir();
    file = join(temp.dir, "nested", "secrets.json");
  });
  afterEach(() => temp.cleanup());

  it("keeps, returns and forgets values in one JSON file", async () => {
    const store = createFileSecretStore(file, { mode: 0o600 });
    expect(await store.get("token")).toBeNull();
    await store.set("token", "abc");
    await store.set("user", "me");
    expect(await store.get("token")).toBe("abc");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ token: "abc", user: "me" });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    await store.delete("token");
    expect(await store.get("token")).toBeNull();
    expect(await store.get("user")).toBe("me");
  });

  it("stores what encode makes of a value and reads it back through decode", async () => {
    const store = createFileSecretStore(file, {
      encode: (value) => Buffer.from(value).toString("base64"),
      decode: (stored) => (stored === "broken" ? null : Buffer.from(stored, "base64").toString()),
    });
    await store.set("token", "abc");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ token: "YWJj" });
    expect(await store.get("token")).toBe("abc");
    const unreadable = createFileSecretStore(file, { decode: () => null });
    expect(await unreadable.get("token")).toBeNull();
  });

  it("refuses to keep a value while unavailable", async () => {
    const store = createFileSecretStore(file, { available: () => false });
    expect(store.available()).toBe(false);
    const error = await store.set("token", "abc").catch((thrown: unknown) => thrown);
    expect(isAppError(error, "CREDENTIALS_UNAVAILABLE")).toBe(true);
    expect(await store.get("token")).toBeNull();
  });
});
