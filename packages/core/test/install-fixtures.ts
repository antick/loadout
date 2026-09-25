import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Zippable, strToU8, zipSync } from "fflate";
import type { AppEvents } from "@loadout/shared";
import { AgentRegistry } from "../src/agents/registry";
import { type InstallService, type InstallServiceDeps, createInstallService } from "../src/install";
import { CLONE_DIR_PREFIX } from "../src/install/git-client";
import type { TestWorld } from "./helpers";

const UNIX_HOST = 3;
const MODE_SHIFT = 16;
const GITHUB_PREFIX = "https://github.com/";

/** Identity and isolation for fixture commits; never reads the developer's own git config. */
const FIXTURE_GIT_ENV = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
};

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
    cwd,
    env: { ...process.env, ...FIXTURE_GIT_ENV },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** `git init` a folder on branch `main`. Add files, then call {@link commitAll}. */
export function initRepo(dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--quiet", "--initial-branch=main");
  return dir;
}

export function commitAll(dir: string, message = "change"): string {
  git(dir, "add", "--all");
  git(dir, "commit", "--quiet", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

export interface ZipEntry {
  content: string;
  /** Unix permission bits, e.g. 0o755. Marks the entry as made on Unix. */
  mode?: number;
}

/** Write a zip whose entry names are used verbatim, so tests can include hostile paths. */
export function writeZip(path: string, entries: Record<string, string | ZipEntry>): string {
  const data: Zippable = {};
  for (const [name, entry] of Object.entries(entries)) {
    const { content, mode } =
      typeof entry === "string" ? { content: entry, mode: undefined } : entry;
    data[name] =
      mode === undefined
        ? strToU8(content)
        : [strToU8(content), { os: UNIX_HOST, attrs: mode << MODE_SHIFT }];
  }
  writeFileSync(path, zipSync(data));
  return path;
}

export interface CapturedEvent {
  event: keyof AppEvents;
  payload: AppEvents[keyof AppEvents];
}

export interface InstallHarness extends InstallService {
  events: CapturedEvent[];
  progressFor(key: string): string[];
}

/** Install service over a test world, with local git sources allowed and events captured. */
export function createInstallHarness(
  world: TestWorld,
  deps: Partial<InstallServiceDeps> = {},
): InstallHarness {
  const events: CapturedEvent[] = [];
  world.ctx.emit = (event, payload) => {
    events.push({ event, payload });
  };
  const service = createInstallService(world.ctx, {
    store: world.store,
    registry: new AgentRegistry(world.ctx),
    allowLocalGitSources: true,
    ...deps,
  });
  return {
    ...service,
    events,
    progressFor: (key) =>
      events.flatMap(({ event, payload }) =>
        event === "install:progress" && "key" in payload && payload.key === key
          ? [payload.phase]
          : [],
      ),
  };
}

/** Set environment variables for this process; returns the undo function. */
export function setEnv(values: Record<string, string>): () => void {
  const before = Object.keys(values).map((key) => [key, process.env[key]] as const);
  Object.assign(process.env, values);
  return () => {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/**
 * Point `https://github.com/` at a local folder for every git process started from here, so
 * GitHub URLs (tree links, marketplace installs) clone a fixture instead of the network.
 */
export function redirectGithubTo(remotesDir: string): () => void {
  return setEnv({
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `url.${remotesDir}/.insteadOf`,
    GIT_CONFIG_VALUE_0: GITHUB_PREFIX,
  });
}

/** Send `os.tmpdir()` to a private folder so leftover temp checkouts can be counted. */
export function isolateTmpDir(dir: string): () => void {
  mkdirSync(dir, { recursive: true });
  return setEnv({ TMPDIR: dir, TMP: dir, TEMP: dir });
}

export function leftoverCheckouts(tmpDir: string): string[] {
  return readdirSync(tmpDir).filter((name) => name.startsWith(CLONE_DIR_PREFIX));
}

export function skillsDirOf(world: TestWorld): string {
  return join(world.base, "skills");
}

export interface TarFixtureEntry {
  name: string;
  content?: string;
  /** `0` file (default), `5` folder, `2` symbolic link, `L` GNU long name. */
  type?: "0" | "5" | "2" | "L";
  mode?: number;
  linkTarget?: string;
}

const TAR_BLOCK = 512;

function tarField(header: Buffer, at: number, length: number, value: string): void {
  header.write(value.slice(0, length), at, length, "utf8");
}

function tarOctal(value: number, digits: number): string {
  return `${value.toString(8).padStart(digits - 1, "0")}\0`;
}

/** A ustar archive built byte by byte, so tests can include hostile names and links. */
export function tarBuffer(entries: TarFixtureEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.content ?? "", "utf8");
    const header = Buffer.alloc(TAR_BLOCK);
    tarField(header, 0, 100, entry.name);
    tarField(header, 100, 8, tarOctal(entry.mode ?? 0o644, 8));
    tarField(header, 124, 12, tarOctal(body.length, 12));
    tarField(header, 136, 12, tarOctal(0, 12));
    header.fill(0x20, 148, 156);
    tarField(header, 156, 1, entry.type ?? "0");
    tarField(header, 157, 100, entry.linkTarget ?? "");
    tarField(header, 257, 6, "ustar\0");
    tarField(header, 263, 2, "00");
    let sum = 0;
    for (const byte of header) sum += byte;
    tarField(header, 148, 8, tarOctal(sum, 7).padEnd(8, " "));
    blocks.push(header, body, Buffer.alloc((TAR_BLOCK - (body.length % TAR_BLOCK)) % TAR_BLOCK));
  }
  blocks.push(Buffer.alloc(TAR_BLOCK * 2));
  return Buffer.concat(blocks);
}
