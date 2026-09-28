#!/usr/bin/env node
/**
 * Write the Homebrew formula (the command-line tool) and cask (the desktop app) for one release,
 * from the files attached to it:
 *
 *   node scripts/homebrew.mjs --version 0.2.0 --assets dist --out tap
 *
 * writes tap/Formula/loadout.rb and tap/Casks/loadout.rb with the download URLs and SHA-256 of
 * every file. A missing file stops it: a formula must never point at something that is not there.
 * publish-homebrew.yml runs it when a release is published and pushes the result to the tap.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** GitHub repository whose releases hold the files. */
const DEFAULT_REPO = "antick/loadout";
const HOMEPAGE = "https://loadout.potion.sh/";
const DESCRIPTION = "Manage AI agent skills across every coding tool";
const LICENSE = "GPL-3.0-only";
/** Electron 38 and later need macOS 12 (Homebrew reads a bare version as "this or newer"). */
const MACOS_MINIMUM = ":monterey";
/** Standalone CLI executables per Homebrew platform block. */
const CLI_TARGETS = {
  macArm: "darwin-arm64",
  macIntel: "darwin-x64",
  linuxArm: "linux-arm64",
  linuxIntel: "linux-x64",
};
/** electron-builder's names for the two Mac builds. */
const APP_ARCHES = { arm: "arm64", intel: "x64" };

function option(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : argv[index + 1];
  if (value === undefined && fallback === undefined) {
    throw new Error(`Missing --${name}. Usage: --version <x.y.z> --assets <dir> --out <dir>`);
  }
  return value ?? fallback;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Download URL and checksum of one release file; throws when it is not in `assets`. */
function asset(context, file) {
  const path = join(context.assets, file);
  if (!existsSync(path)) throw new Error(`${file} is not in ${context.assets}.`);
  return {
    url: `https://github.com/${context.repo}/releases/download/v${context.version}/${file}`,
    sha: sha256(path),
  };
}

const cliFile = (version, target) => `loadout-cli-${version}-${target}`;
const appFile = (version, arch) => `Loadout-${version}-mac-${arch}.dmg`;

export function formula(context) {
  const block = (target) => {
    const { url, sha } = asset(context, cliFile(context.version, target));
    return `      url "${url}"\n      sha256 "${sha}"`;
  };
  return `# Written by scripts/homebrew.mjs in ${context.repo}. Do not edit by hand.
class Loadout < Formula
  desc "${DESCRIPTION}"
  homepage "${HOMEPAGE}"
  version "${context.version}"
  license "${LICENSE}"

  on_macos do
    on_arm do
${block(CLI_TARGETS.macArm)}
    end
    on_intel do
${block(CLI_TARGETS.macIntel)}
    end
  end

  on_linux do
    on_arm do
${block(CLI_TARGETS.linuxArm)}
    end
    on_intel do
${block(CLI_TARGETS.linuxIntel)}
    end
  end

  def install
    bin.install Dir["loadout-cli-*"].first => "loadout"
    # A release download arrives without the executable bit.
    chmod 0755, bin/"loadout"
    generate_completions_from_executable(bin/"loadout", "completion", shells: [:bash, :zsh])
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/loadout --version").strip
  end
end
`;
}

export function cask(context) {
  const arm = asset(context, appFile(context.version, APP_ARCHES.arm));
  const intel = asset(context, appFile(context.version, APP_ARCHES.intel));
  return `# Written by scripts/homebrew.mjs in ${context.repo}. Do not edit by hand.
cask "loadout" do
  arch arm: "${APP_ARCHES.arm}", intel: "${APP_ARCHES.intel}"

  version "${context.version}"
  sha256 arm:   "${arm.sha}",
         intel: "${intel.sha}"

  url "https://github.com/${context.repo}/releases/download/v#{version}/Loadout-#{version}-mac-#{arch}.dmg"
  name "Loadout"
  desc "${DESCRIPTION}"
  homepage "${HOMEPAGE}"

  # The app updates itself from its GitHub releases.
  auto_updates true
  depends_on macos: ${MACOS_MINIMUM}

  app "Loadout.app"

  # Only the app's own files: the skill library in ~/.loadout is yours and stays.
  zap trash: "~/.loadout/app"
end
`;
}

function main(argv) {
  const context = {
    version: option(argv, "version").replace(/^v/, ""),
    assets: option(argv, "assets"),
    repo: option(argv, "repo", process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO),
  };
  const out = option(argv, "out");
  const files = [
    [join(out, "Formula", "loadout.rb"), formula(context)],
    [join(out, "Casks", "loadout.rb"), cask(context)],
  ];
  for (const [path, text] of files) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
    console.log(`Wrote ${path}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
