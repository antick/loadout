/**
 * Standalone CLI downloads: one executable per OS that needs no Node installed, built as a Node
 * single executable application (SEA). The bundle is injected into the official Node binary of
 * each target, which must be the same Node version that prepares the blob: this one.
 *
 *   node scripts/standalone.mjs                 this computer's platform only
 *   node scripts/standalone.mjs --all           every target (macOS targets need a Mac to sign)
 *   node scripts/standalone.mjs --target linux-arm64,win-x64
 *
 * Output: dist/standalone/loadout-cli-<version>-<target>[.exe] plus SHA256SUMS.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "win-x64"];
const NODE_DIST_URL = "https://nodejs.org/dist";
const POSTJECT = "postject@1.0.0-alpha.6";
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const SEA_RESOURCE = "NODE_SEA_BLOB";
const MACHO_SEGMENT = "NODE_SEA";
const NODE_TARGET = "node22";
const BUILD_DIR = "dist/sea";
const OUT_DIR = "dist/standalone";
const NODE_CACHE_DIR = join(tmpdir(), "loadout-node-binaries");
const SUMS_FILE = "SHA256SUMS";

const nodeVersion = process.versions.node;
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const hostTarget = `${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
}

function chosenTargets(argv) {
  if (argv.includes("--all")) return TARGETS;
  const flag = argv.indexOf("--target");
  if (flag === -1) return [hostTarget];
  const wanted = (argv[flag + 1] ?? "").split(",").filter(Boolean);
  const unknown = wanted.filter((target) => !TARGETS.includes(target));
  if (wanted.length === 0 || unknown.length > 0) {
    throw new Error(`Unknown target "${unknown.join(", ")}". Choose from: ${TARGETS.join(", ")}`);
  }
  return wanted;
}

/** The CLI as one CommonJS file (SEA runs CommonJS) and the blob Node injects. */
async function prepareBlob() {
  mkdirSync(BUILD_DIR, { recursive: true });
  const main = join(BUILD_DIR, "loadout.cjs");
  const blob = join(BUILD_DIR, "loadout.blob");
  await build({
    entryPoints: ["src/bin.ts"],
    bundle: true,
    platform: "node",
    target: NODE_TARGET,
    format: "cjs",
    outfile: main,
    logLevel: "warning",
  });
  const config = join(BUILD_DIR, "sea-config.json");
  // No code cache or snapshot: they tie the blob to this platform, and it goes into all of them.
  writeFileSync(
    config,
    JSON.stringify({
      main,
      output: blob,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      useSnapshot: false,
    }),
  );
  run(process.execPath, ["--experimental-sea-config", config]);
  return blob;
}

/** The official Node binary for a target, downloaded once into a temp cache. */
async function nodeBinary(target) {
  if (target === hostTarget) return process.execPath;
  const windows = target.startsWith("win");
  const name = `node-v${nodeVersion}-${target}`;
  const inner = windows ? `${name}/node.exe` : `${name}/bin/node`;
  const binary = join(NODE_CACHE_DIR, inner);
  if (existsSync(binary)) return binary;

  mkdirSync(NODE_CACHE_DIR, { recursive: true });
  const archive = join(NODE_CACHE_DIR, `${name}.${windows ? "zip" : "tar.xz"}`);
  const url = `${NODE_DIST_URL}/v${nodeVersion}/${name}.${windows ? "zip" : "tar.xz"}`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  if (windows && process.platform !== "win32") {
    run("unzip", ["-q", "-o", archive, inner, "-d", NODE_CACHE_DIR]);
  } else {
    run("tar", ["-xf", archive, "-C", NODE_CACHE_DIR, inner]);
  }
  return binary;
}

async function buildTarget(target, blob) {
  const mac = target.startsWith("darwin");
  if (mac && process.platform !== "darwin") {
    console.warn(`Skipping ${target}: a macOS executable has to be signed on a Mac.`);
    return null;
  }
  const file = `loadout-cli-${version}-${target}${target.startsWith("win") ? ".exe" : ""}`;
  const out = join(OUT_DIR, file);
  copyFileSync(await nodeBinary(target), out);
  chmodSync(out, 0o755);
  if (mac) run("codesign", ["--remove-signature", out]);
  run("pnpm", [
    "dlx",
    POSTJECT,
    out,
    SEA_RESOURCE,
    blob,
    "--sentinel-fuse",
    SEA_FUSE,
    ...(mac ? ["--macho-segment-name", MACHO_SEGMENT] : []),
  ]);
  // Ad-hoc signature: enough for Apple silicon to run it. Release signing happens separately.
  if (mac) run("codesign", ["--sign", "-", out]);
  return file;
}

const targets = chosenTargets(process.argv.slice(2));
mkdirSync(OUT_DIR, { recursive: true });
const blob = await prepareBlob();
const built = [];
for (const target of targets) {
  const file = await buildTarget(target, blob);
  if (file) built.push(file);
}
// Every build of this version in the folder, so separate runs (one per OS) add up.
const prefix = `loadout-cli-${version}-`;
const files = readdirSync(OUT_DIR)
  .filter((file) => file.startsWith(prefix))
  .sort();
const sums = files.map((file) => {
  const hash = createHash("sha256")
    .update(readFileSync(join(OUT_DIR, file)))
    .digest("hex");
  return `${hash}  ${file}`;
});
writeFileSync(join(OUT_DIR, SUMS_FILE), `${sums.join("\n")}\n`);
console.log(`Built ${built.length} standalone CLI file(s) in ${OUT_DIR}`);
