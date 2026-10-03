import { describe, expect, it } from "vitest";
import { isWebUrl } from "./links";

describe("isWebUrl", () => {
  it("takes web links in any casing and nothing else", () => {
    expect(isWebUrl("https://example.com/page")).toBe(true);
    expect(isWebUrl("HTTPS://Example.com")).toBe(true);
    expect(isWebUrl("http://localhost:8080")).toBe(true);
    expect(isWebUrl("file:///etc/passwd")).toBe(false);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("mailto:me@example.com")).toBe(false);
    expect(isWebUrl("not a url")).toBe(false);
  });
});
