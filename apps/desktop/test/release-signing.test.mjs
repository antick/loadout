import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { requireValues, signingIdentity } from "../../../scripts/release/macos.mjs";

const require = createRequire(import.meta.url);
const requireSigning = require("../scripts/require-release-signing.cjs");
const TEAM = "ABC1234567";
const IDENTITY = `Developer ID Application: Test Publisher (${TEAM})`;

afterEach(() => vi.unstubAllEnvs());

it("accepts only the intended team's Developer ID Application certificate", () => {
  const output = `1) hash "${IDENTITY}"\n2) hash "Apple Development: Test Publisher (${TEAM})"`;
  expect(signingIdentity(output, TEAM)).toBe(IDENTITY);
  expect(() => signingIdentity(output, "OTHER12345")).toThrow("exactly one");
  expect(() => signingIdentity(`${output}\n3) hash "${IDENTITY}"`, TEAM)).toThrow("exactly one");
  expect(() => signingIdentity(output, "bad\nTEAM")).toThrow("team identifier");
});

it("reports missing setting names without disclosing supplied secrets", () => {
  expect(() => requireValues({ KEY: "private", PASSWORD: " " }, ["KEY", "PASSWORD"])).toThrow(
    "Missing release settings: PASSWORD",
  );
});

it("refuses a public Mac build when signing or notarization is missing", async () => {
  for (const name of [
    "CSC_NAME",
    "CSC_KEYCHAIN",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ]) {
    vi.stubEnv(name, "");
  }
  await expect(requireSigning({ electronPlatformName: "darwin" })).rejects.toThrow(
    "not configured",
  );
  await expect(requireSigning({ electronPlatformName: "linux" })).resolves.toBeUndefined();
  for (const name of [
    "CSC_NAME",
    "CSC_KEYCHAIN",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ]) {
    vi.stubEnv(name, "test-value");
  }
  await expect(requireSigning({ electronPlatformName: "darwin" })).resolves.toBeUndefined();
  vi.stubEnv("APPLE_API_KEY", "");
  await expect(requireSigning({ electronPlatformName: "darwin" })).rejects.toThrow("APPLE_API_KEY");
});
