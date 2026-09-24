#!/usr/bin/env node
// Writes `latest.json`, the update feed the app reads, for the installers in a folder.
//
//   node apps/desktop/scripts/update-feed.mjs <folder> --version 0.2.0 --repo owner/name
//   node apps/desktop/scripts/update-feed.mjs <folder> --version 0.2.0 --base-url http://127.0.0.1:8080
//
// The file names come from `artifactName` in electron-builder.yml. The keys match
// `UpdateTarget` in src/main/update/feed.ts.
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const FEED_FILE = "latest.json";

const ARCHES = { x64: "x64", x86_64: "x64", amd64: "x64", arm64: "arm64", aarch64: "arm64" };

/** The feed key for an installer file name, or null for files the app does not update from. */
export function targetForFile(name) {
  const arch = (pattern) => ARCHES[name.match(pattern)?.[1] ?? ""] ?? null;
  let found;
  if (name.endsWith(".zip") && (found = arch(/-mac-(\w+)\.zip$/))) return `darwin-${found}`;
  if (name.endsWith(".exe") && (found = arch(/-Setup-.+-(\w+)\.exe$/))) return `win32-${found}`;
  if (name.endsWith(".AppImage") && (found = arch(/[-_](\w+)\.AppImage$/))) {
    return `linux-${found}-appimage`;
  }
  if (name.endsWith(".deb") && (found = arch(/_(\w+)\.deb$/))) return `linux-${found}-deb`;
  return null;
}

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Build the feed object for every installer in `dir`. */
export async function buildFeed({ dir, version, repo, baseUrl }) {
  const tag = `v${version}`;
  const releaseUrl = repo ? `https://github.com/${repo}/releases/tag/${tag}` : null;
  const downloadBase = baseUrl ?? `https://github.com/${repo}/releases/download/${tag}`;
  const files = {};
  for (const name of readdirSync(dir).sort()) {
    const target = targetForFile(name);
    if (!target) continue;
    if (files[target]) throw new Error(`Two files for ${target}: ${files[target].name}, ${name}`);
    const path = join(dir, name);
    files[target] = {
      name,
      url: `${downloadBase}/${encodeURIComponent(name)}`,
      sha256: await sha256(path),
      size: statSync(path).size,
    };
  }
  return { version, releasedAt: new Date().toISOString(), releaseUrl, files };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      version: { type: "string" },
      repo: { type: "string" },
      "base-url": { type: "string" },
      require: { type: "string", multiple: true, default: [] },
    },
  });
  const dir = positionals[0];
  if (!dir || !values.version || (!values.repo && !values["base-url"])) {
    console.error(
      "Usage: update-feed.mjs <folder> --version X.Y.Z (--repo owner/name | --base-url URL)",
    );
    process.exit(2);
  }
  const feed = await buildFeed({
    dir,
    version: values.version,
    repo: values.repo,
    baseUrl: values["base-url"],
  });
  const missing = values.require.filter((target) => !feed.files[target]);
  if (missing.length > 0) {
    console.error(`No installer found for: ${missing.join(", ")}`);
    process.exit(1);
  }
  writeFileSync(join(dir, FEED_FILE), `${JSON.stringify(feed, null, 2)}\n`);
  for (const [target, file] of Object.entries(feed.files)) console.log(`${target}\t${file.name}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
