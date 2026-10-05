import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Zippable, strToU8, zipSync } from "fflate";
import type { AppEvents, InstallApi, Skill } from "@loadout/shared";
import { AgentRegistry } from "../src/agents/registry";
import { createRequest } from "../src/install/download";
import {
  type InstallService,
  type InstallServiceDeps,
  createInstallService,
} from "../src/install/service";
import { CLONE_DIR_PREFIX } from "../src/install/git-client";
import { createClawhubClient } from "../src/market/clawhub";
import { createScanService } from "../src/scan/service";
import { createSourceNewsStore } from "../src/sources";
import { createRemovedStore } from "../src/storage";
import { setEnv } from "./git-env";
import { type TestWorld, passingSafety } from "./helpers";

export { redirectGithubTo, setEnv } from "./git-env";

const UNIX_HOST = 3;
const MODE_SHIFT = 16;

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
    cwd,
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

export interface InstallHarness extends Omit<InstallService, "api"> {
  /** The whole install API, the scan of this machine included, as `createCore` assembles it. */
  api: InstallApi;
  events: CapturedEvent[];
  progressFor(key: string): string[];
}

export interface InstallHarnessDeps extends Partial<InstallServiceDeps> {
  /** A fake web, for downloads and the ClawHub registry. */
  fetchImpl?: typeof fetch;
}

/**
 * Install service over a test world, with events captured. Safety passes everything and a
 * replaced skill goes to Recently removed, unless `deps` says otherwise.
 */
export function createInstallHarness(
  world: TestWorld,
  deps: InstallHarnessDeps = {},
): InstallHarness {
  const events: CapturedEvent[] = [];
  world.ctx.emit = (event, payload) => {
    events.push({ event, payload });
  };
  const { fetchImpl, ...overrides } = deps;
  const request = overrides.request ?? createRequest(fetchImpl);
  const registry = new AgentRegistry(world.ctx);
  const service = createInstallService(world.ctx, {
    store: world.store,
    registry,
    request,
    clawhub: createClawhubClient(request),
    safety: passingSafety,
    replace: {
      removed: createRemovedStore(world.ctx, { store: world.store }),
      refreshCopies: async () => undefined,
    },
    sourceNews: createSourceNewsStore(world.ctx),
    ...overrides,
  });
  const scan = createScanService(world.ctx, {
    store: world.store,
    registry: overrides.registry ?? registry,
    install: service.installIntoLibrary,
    safety: overrides.safety ?? passingSafety,
  });
  return {
    ...service,
    api: {
      ...service.api,
      scanLocal: scan.scanLocal,
      importDiscovered: scan.importDiscovered,
      importAllDiscovered: scan.importAllDiscovered,
    },
    events,
    progressFor: (key) =>
      events.flatMap(({ event, payload }) =>
        event === "install:progress" && "key" in payload && payload.key === key
          ? [payload.phase]
          : [],
      ),
  };
}

/** Send `os.tmpdir()` to a private folder so leftover temp checkouts can be counted. */
export function isolateTmpDir(dir: string): () => void {
  mkdirSync(dir, { recursive: true });
  return setEnv({ TMPDIR: dir, TMP: dir, TEMP: dir });
}

export function leftoverCheckouts(tmpDir: string): string[] {
  return readdirSync(tmpDir).filter((name) => name.startsWith(CLONE_DIR_PREFIX));
}

/** Install every skill of an archive file as the app does: preview it, then confirm. */
export async function installArchive(api: InstallApi, path: string, name = ""): Promise<Skill> {
  const preview = await api.previewArchive(path);
  const items = preview.skills.map((skill) => ({ relPath: skill.relPath, name }));
  const [skill] = await api.confirmGit(preview.previewId, items);
  if (!skill) throw new Error(`Nothing installed from ${path}`);
  return skill;
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
