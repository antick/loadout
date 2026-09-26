#!/usr/bin/env node
// Signs the update feed with the release key, so the app can tell it came from this project.
//
//   UPDATE_FEED_SIGNING_KEY="$(cat key.pem)" node apps/desktop/scripts/sign-feed.mjs dist/latest.json
//
// Writes `<feed>.sig` (ed25519, base64). Refuses when the key does not match the public key built
// into the app (UPDATE_FEED_PUBLIC_KEY in packages/shared/src/constants.ts): a feed signed with
// any other key would be rejected by every installed copy, and updates would stop.
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY_ENV = "UPDATE_FEED_SIGNING_KEY";
const SIGNATURE_SUFFIX = ".sig";
const CONSTANTS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/shared/src/constants.ts",
);
const PUBLIC_KEY_PATTERN = /UPDATE_FEED_PUBLIC_KEY\s*=\s*"([A-Za-z0-9+/=]+)"/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const feedPath = process.argv[2];
if (!feedPath) fail("Usage: sign-feed.mjs <latest.json>");
const pem = process.env[KEY_ENV];
if (!pem?.trim()) fail(`${KEY_ENV} is empty: add the release signing key as a repository secret.`);

const expected = PUBLIC_KEY_PATTERN.exec(readFileSync(CONSTANTS, "utf8"))?.[1];
if (!expected) fail(`Could not find UPDATE_FEED_PUBLIC_KEY in ${CONSTANTS}`);

const privateKey = createPrivateKey(pem);
const derived = createPublicKey(privateKey)
  .export({ type: "spki", format: "der" })
  .toString("base64");
if (derived !== expected) {
  fail("The signing key does not match UPDATE_FEED_PUBLIC_KEY: installed apps would reject it.");
}

const feed = readFileSync(feedPath);
const signature = sign(null, feed, privateKey);
const publicKey = createPublicKey({
  key: Buffer.from(expected, "base64"),
  format: "der",
  type: "spki",
});
if (!verify(null, feed, publicKey, signature)) fail("The new signature does not verify.");
writeFileSync(`${feedPath}${SIGNATURE_SUFFIX}`, `${signature.toString("base64")}\n`);
console.log(`Signed ${feedPath}`);
