import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SIGNING_DIR = "loadout-release-signing";
const KEYCHAIN_FILE = "release.keychain-db";
const TEAM_PATTERN = /^[A-Z0-9]{10}$/;
const IDENTITY_PATTERN = /"(Developer ID Application: [^"\n]+)"/g;
const identity = JSON.parse(
  readFileSync(join(ROOT, "packages/shared/src/app-identity.json"), "utf8"),
);
const { version } = JSON.parse(readFileSync(join(ROOT, "apps/desktop/package.json"), "utf8"));
const CLI_ENTITLEMENTS = join(ROOT, "scripts/release/entitlements.cli.plist");

export function requireValues(env, names) {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing release settings: ${missing.join(", ")}`);
}

export function signingIdentity(output, team) {
  if (!TEAM_PATTERN.test(team)) throw new Error("APPLE_TEAM_ID must be an Apple team identifier");
  const found = [...output.matchAll(IDENTITY_PATTERN)]
    .map((match) => match[1])
    .filter((name) => name.endsWith(`(${team})`));
  if (found.length !== 1)
    throw new Error(
      "Expected exactly one valid Developer ID Application certificate for this team",
    );
  return found[0];
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    // execFile errors include arguments. Certificate and keychain passwords must never reach logs.
    throw new Error(`${command} ${args[0]} failed; signing stopped`);
  }
}

function paths(env) {
  requireValues(env, ["RUNNER_TEMP"]);
  const dir = join(env.RUNNER_TEMP, SIGNING_DIR);
  return { dir, keychain: join(dir, KEYCHAIN_FILE), key: join(dir, "AuthKey.p8") };
}

function prepare(env) {
  requireValues(env, [
    "MACOS_CERTIFICATE_P12",
    "MACOS_CERTIFICATE_PASSWORD",
    "APPLE_TEAM_ID",
    "APPLE_API_KEY_P8",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
    "GITHUB_ENV",
  ]);
  const { dir, keychain, key } = paths(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const certificate = join(dir, "certificate.p12");
  writeFileSync(certificate, Buffer.from(env.MACOS_CERTIFICATE_P12, "base64"), { mode: 0o600 });
  writeFileSync(key, env.APPLE_API_KEY_P8, { mode: 0o600 });
  const password = randomBytes(32).toString("hex");
  run("security", ["create-keychain", "-p", password, keychain]);
  run("security", ["set-keychain-settings", "-lut", "21600", keychain]);
  run("security", ["unlock-keychain", "-p", password, keychain]);
  // The PKCS#12 export contains the leaf certificate only. Clean CI hosts need its Apple issuer.
  run("security", ["import", join(ROOT, "scripts/release/DeveloperIDG2CA.cer"), "-k", keychain]);
  run("security", [
    "import",
    certificate,
    "-P",
    env.MACOS_CERTIFICATE_PASSWORD,
    "-k",
    keychain,
    "-T",
    "/usr/bin/codesign",
    "-T",
    "/usr/bin/security",
  ]);
  run("security", [
    "set-key-partition-list",
    "-S",
    "apple-tool:,apple:",
    "-s",
    "-k",
    password,
    keychain,
  ]);
  const name = signingIdentity(
    run("security", ["find-identity", "-v", "-p", "codesigning", keychain]),
    env.APPLE_TEAM_ID,
  );
  const qualifier = name.replace("Developer ID Application: ", "");
  appendFileSync(
    env.GITHUB_ENV,
    `CSC_NAME=${qualifier}\nCSC_KEYCHAIN=${keychain}\nAPPLE_API_KEY=${key}\n`,
  );
  rmSync(certificate);
  console.log("Temporary release keychain is ready.");
}

function notarize(file, env) {
  requireValues(env, ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"]);
  const result = JSON.parse(
    run("xcrun", [
      "notarytool",
      "submit",
      file,
      "--key",
      env.APPLE_API_KEY,
      "--key-id",
      env.APPLE_API_KEY_ID,
      "--issuer",
      env.APPLE_API_ISSUER,
      "--wait",
      "--timeout",
      "30m",
      "--output-format",
      "json",
    ]),
  );
  if (result.status !== "Accepted")
    throw new Error(`Notarization failed: ${result.status}; submission ${result.id}`);
}

function verifyBundle(bundle, env) {
  requireValues(env, ["APPLE_TEAM_ID"]);
  if (!TEAM_PATTERN.test(env.APPLE_TEAM_ID)) throw new Error("Invalid Apple team identifier");
  const requirement = `anchor apple generic and identifier "${identity.id}" and certificate leaf[subject.OU] = "${env.APPLE_TEAM_ID}" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists`;
  run("codesign", ["--verify", "--deep", "--strict", "-R", `=${requirement}`, bundle]);
  const plist = join(bundle, "Contents/Info.plist");
  const actual = run("plutil", [
    "-extract",
    "CFBundleShortVersionString",
    "raw",
    "-o",
    "-",
    plist,
  ]).trim();
  if (actual !== version) throw new Error(`Packaged version ${actual} does not match ${version}`);
  run("xcrun", ["stapler", "validate", bundle]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", bundle]);
}

function verifyInstallers(env) {
  const release = join(ROOT, "apps/desktop/release");
  const { dir } = paths(env);
  for (const arch of ["arm64", "x64"]) {
    const name = `Loadout-${version}-mac-${arch}`;
    const extracted = join(dir, `verify-${arch}`);
    mkdirSync(extracted, { recursive: true });
    run("ditto", ["-x", "-k", join(release, `${name}.zip`), extracted]);
    verifyBundle(join(extracted, `${identity.name}.app`), env);
    const dmg = join(release, `${name}.dmg`);
    run("codesign", [
      "--force",
      "--timestamp",
      "--sign",
      env.CSC_NAME,
      "--keychain",
      env.CSC_KEYCHAIN,
      dmg,
    ]);
    notarize(dmg, env);
    run("xcrun", ["stapler", "staple", dmg]);
    run("xcrun", ["stapler", "validate", dmg]);
    run("spctl", [
      "--assess",
      "--type",
      "open",
      "--context",
      "context:primary-signature",
      "--verbose=4",
      dmg,
    ]);
    const mount = join(dir, `mount-${arch}`);
    run("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmg]);
    try {
      verifyBundle(join(mount, `${identity.name}.app`), env);
    } finally {
      run("hdiutil", ["detach", mount]);
    }
    rmSync(extracted, { recursive: true });
    console.log(`Verified signed and notarized ${arch} DMG and ZIP.`);
  }
}

function signCli(env) {
  requireValues(env, ["CSC_NAME", "CSC_KEYCHAIN"]);
  const out = join(ROOT, "packages/cli/dist/standalone");
  const { dir } = paths(env);
  for (const arch of ["arm64", "x64"]) {
    const binary = join(out, `loadout-cli-${version}-darwin-${arch}`);
    run("codesign", [
      "--force",
      "--timestamp",
      "--options",
      "runtime",
      "--entitlements",
      CLI_ENTITLEMENTS,
      "--sign",
      env.CSC_NAME,
      "--keychain",
      env.CSC_KEYCHAIN,
      binary,
    ]);
    run("codesign", ["--verify", "--strict", binary]);
    // Run each build on matching hardware (and Intel through Rosetta on Apple Silicon).
    // Notarization checks signatures; it does not prove Node's JIT can start.
    if (arch === process.arch || process.arch === "arm64") {
      if (run(binary, ["--version"]).trim() !== version)
        throw new Error(`The signed ${arch} CLI did not report ${version}`);
    }
    const archive = join(dir, `cli-${arch}.zip`);
    run("ditto", ["-c", "-k", "--keepParent", binary, archive]);
    notarize(archive, env);
    console.log(`Signed and notarized ${arch} CLI.`);
  }
  // Signing changes the binaries, so checksums must be written afterwards.
  const sums = readdirSync(out)
    .filter((name) => name.startsWith(`loadout-cli-${version}-`))
    .sort()
    .map(
      (name) =>
        `${createHash("sha256")
          .update(readFileSync(join(out, name)))
          .digest("hex")}  ${name}`,
    );
  writeFileSync(join(out, "SHA256SUMS"), `${sums.join("\n")}\n`);
}

function cleanup(env) {
  const { dir, keychain } = paths(env);
  try {
    run("security", ["delete-keychain", keychain]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== "darwin") throw new Error("macOS signing requires a Mac");
    const commands = { prepare, verify: verifyInstallers, cli: signCli, cleanup };
    const command = commands[process.argv[2]];
    if (!command) throw new Error("Usage: macos.mjs prepare|verify|cli|cleanup");
    command(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
