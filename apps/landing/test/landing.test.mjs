import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const output = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", output), "utf8");

test("the built page has working section links and local images", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "IDs must be unique");
  for (const [, target] of html.matchAll(/\bhref="#([^"]+)"/g)) {
    assert.ok(ids.includes(target), `Missing anchor: ${target}`);
  }
  for (const [tag, source] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) {
    assert.match(tag, /\balt="[^"]*"/, "Images need alternative text");
    assert.match(tag, /\bwidth="\d+"/, "Reserve image width");
    assert.match(tag, /\bheight="\d+"/, "Reserve image height");
    assert.ok(existsSync(fileURLToPath(new URL(source.slice(1), output))), source);
  }
});

test("navigation, downloads, and disclosures work without client scripts", () => {
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.match(html, /<html\b[^>]*\blang="en"/);
  assert.match(html, /class="skip-link"[^>]*href="#main"/);
  assert.match(html, /<main\b[^>]*id="main"[^>]*tabindex="-1"/);
  assert.match(html, /href="https:\/\/github.com\/antick\/loadout\/releases\/latest"/);
  // The test build (`--mode offline`) never reads the live feed, so it links no installer file.
  assert.doesNotMatch(html, /\/releases\/download\//);
  assert.match(html, /<details\b[^>]*>\s*<summary\b/);
  assert.doesNotMatch(html, /<script\b/, "This page should not require JavaScript");
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /rel="canonical" href="https:\/\/loadout.potion.sh\/"/);
});
