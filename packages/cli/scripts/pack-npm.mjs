/**
 * The npm package of the command-line tool: the single bundled file from `build.mjs`, a
 * package.json of its own, a README and the licence, in dist/npm. The workspace package stays
 * private under its internal name; this folder is what gets published:
 *
 *   pnpm --filter @loadout/cli run pack:npm
 *   cd packages/cli/dist/npm && pnpm publish --access public
 *
 * The version is the app's, so `loadout --version` and the desktop app always agree.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_NAME = "@antick/loadout";
const BINARY = "loadout";
const BUNDLE = "dist/loadout.mjs";
/** The bundle's name inside the package; `loadout.mjs` is the small launcher in front of it. */
const BUNDLE_NAME = "cli.mjs";
const OUT_DIR = "dist/npm";
const APP_PACKAGE = "../../apps/desktop/package.json";
const LICENSE_FILE = "../../LICENSE";
const REPOSITORY = "https://github.com/antick/loadout";
/** `node:sqlite` works without a flag from here on. */
const NODE_ENGINE = ">=22.13.0";

const app = JSON.parse(readFileSync(APP_PACKAGE, "utf8"));
const cli = JSON.parse(readFileSync("package.json", "utf8"));

const manifest = {
  name: PACKAGE_NAME,
  version: app.version,
  description:
    "Manage AI agent skills from the command line: install, deploy, update, rename, check.",
  license: cli.license,
  type: "module",
  bin: { [BINARY]: `./${BINARY}.mjs` },
  files: [`${BINARY}.mjs`, BUNDLE_NAME, "README.md", "LICENSE"],
  engines: { node: NODE_ENGINE },
  repository: { type: "git", url: `git+${REPOSITORY}.git`, directory: "packages/cli" },
  homepage: `${REPOSITORY}#readme`,
  bugs: `${REPOSITORY}/issues`,
  keywords: ["agent-skills", "claude-code", "codex", "cursor", "skills", "cli"],
  publishConfig: { access: "public" },
};

/**
 * Node 22 and 23 call \`node:sqlite\` experimental and say so on every run, before any code of
 * the bundle runs. The launcher drops that one warning, then loads the bundle.
 */
const launcher = `#!/usr/bin/env node
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
  String(warning).includes("SQLite is an experimental feature")
    ? undefined
    : emitWarning.call(process, warning, ...rest);
await import("./${BUNDLE_NAME}");
`;

const readme = `# ${PACKAGE_NAME}

The \`${BINARY}\` command-line tool of [Loadout](${REPOSITORY}): one library of AI agent skills,
deployed to Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and 49 more agents.

It works on the same library as the desktop app (\`~/.loadout\`), or on its own without it.

## Install

Needs Node.js ${NODE_ENGINE.slice(2)} or newer.

\`\`\`sh
pnpm add -g ${PACKAGE_NAME}
${BINARY} --help
\`\`\`

## A few commands

\`\`\`sh
${BINARY} agents list --installed
${BINARY} skills install owner/repo --skill pdf-tools
${BINARY} skills deploy pdf-tools --agent claude_code --dry-run
${BINARY} skills list --query pdf
${BINARY} skills rename pdf-tools pdf-forms
${BINARY} doctor
\`\`\`

Every command takes \`--json\` for scripts and agents. Run \`${BINARY} <group> --help\` for the rest.

Licence: ${cli.license}.
`;

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(BUNDLE, join(OUT_DIR, BUNDLE_NAME));
writeFileSync(join(OUT_DIR, `${BINARY}.mjs`), launcher, { mode: 0o755 });
copyFileSync(LICENSE_FILE, join(OUT_DIR, "LICENSE"));
writeFileSync(join(OUT_DIR, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(OUT_DIR, "README.md"), readme);
console.log(`${PACKAGE_NAME}@${manifest.version} is ready in packages/cli/${OUT_DIR}`);
