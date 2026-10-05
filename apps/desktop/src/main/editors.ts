import { spawn } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { extname, posix, win32 } from "node:path";
import {
  type DetectedEditor,
  EDITOR_IDS,
  EDITOR_NAMES,
  type EditorChoice,
  type EditorId,
  SYSTEM_BIN_DIRS,
  SYSTEM_EDITOR,
} from "@loadout/shared";
import { DOCUMENT_EXTENSIONS, EDITOR_DETECT_TTL_MS } from "./constants";

/** Where an editor lives per platform. Paths are relative to the folder named in the comment. */
interface EditorSpec {
  id: EditorId;
  /** macOS app bundle name, looked for in `/Applications` and `~/Applications`. */
  macApp: string;
  /** Command on `PATH` (macOS and Linux). */
  command: string;
  /** Windows executables, relative to `%LOCALAPPDATA%` or `%ProgramFiles%`. */
  windows: readonly { base: "LOCALAPPDATA" | "ProgramFiles"; path: string }[];
}

const SPECS: readonly EditorSpec[] = [
  {
    id: "vscode",
    macApp: "Visual Studio Code",
    command: "code",
    windows: [
      { base: "LOCALAPPDATA", path: "Programs/Microsoft VS Code/Code.exe" },
      { base: "ProgramFiles", path: "Microsoft VS Code/Code.exe" },
    ],
  },
  {
    id: "cursor",
    macApp: "Cursor",
    command: "cursor",
    windows: [{ base: "LOCALAPPDATA", path: "Programs/cursor/Cursor.exe" }],
  },
  {
    id: "windsurf",
    macApp: "Windsurf",
    command: "windsurf",
    windows: [{ base: "LOCALAPPDATA", path: "Programs/Windsurf/Windsurf.exe" }],
  },
  {
    id: "zed",
    macApp: "Zed",
    command: "zed",
    windows: [{ base: "LOCALAPPDATA", path: "Programs/Zed/Zed.exe" }],
  },
  {
    id: "sublime",
    macApp: "Sublime Text",
    command: "subl",
    windows: [{ base: "ProgramFiles", path: "Sublime Text/sublime_text.exe" }],
  },
];

export interface DetectInput {
  platform: NodeJS.Platform;
  homeDir: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Tests inject a fake file system. */
  exists?: (path: string) => boolean;
}

/** How to start an editor for a path: a program and the arguments before the path. */
export interface EditorLaunch {
  command: string;
  args: string[];
}

/** Found editors with what starts each of them, in `EDITOR_IDS` order. */
export function locateEditors(input: DetectInput): Map<EditorId, EditorLaunch> {
  const exists = input.exists ?? existsSync;
  const found = new Map<EditorId, EditorLaunch>();
  const separator = input.platform === "win32" ? win32.delimiter : posix.delimiter;
  const pathDirs = (input.env.PATH ?? "").split(separator).filter(Boolean);
  for (const spec of SPECS) {
    const launch = locateOne(spec, input, exists, pathDirs);
    if (launch) found.set(spec.id, launch);
  }
  return found;
}

function locateOne(
  spec: EditorSpec,
  input: DetectInput,
  exists: (path: string) => boolean,
  pathDirs: readonly string[],
): EditorLaunch | null {
  // Paths are built the target platform's way, so tests can describe any platform anywhere.
  const { join } = input.platform === "win32" ? win32 : posix;
  if (input.platform === "win32") {
    for (const candidate of spec.windows) {
      const base = input.env[candidate.base];
      if (!base) continue;
      const exe = join(base, candidate.path);
      if (exists(exe)) return { command: exe, args: [] };
    }
    return null;
  }
  if (input.platform === "darwin") {
    for (const folder of ["/Applications", join(input.homeDir, "Applications")]) {
      const bundle = join(folder, `${spec.macApp}.app`);
      if (exists(bundle)) return { command: "open", args: ["-a", bundle] };
    }
  }
  for (const dir of [...pathDirs, ...SYSTEM_BIN_DIRS, join(input.homeDir, ".local", "bin")]) {
    const program = join(dir, spec.command);
    if (exists(program)) return { command: program, args: [] };
  }
  return null;
}

/** The found editors as the renderer lists them. */
export function describeEditors(located: ReadonlyMap<EditorId, EditorLaunch>): DetectedEditor[] {
  return EDITOR_IDS.filter((id) => located.has(id)).map((id) => ({ id, name: EDITOR_NAMES[id] }));
}

/** Start `launch` for `path`, detached, so the editor outlives the app. */
function startEditor(launch: EditorLaunch, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, [...launch.args, path], {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export interface EditorOpenerDeps {
  detect: () => DetectInput;
  /** Electron's `shell.openPath`: resolves to "" on success, else the reason. */
  openPath: (path: string) => Promise<string>;
  /** Shows a path in the file manager without running it (`revealInFileManager`). */
  reveal: (path: string) => Promise<void>;
  /** Whether a path is a plain file, never a folder or a link. Defaults to `lstat`. */
  isFile?: (path: string) => boolean | null;
  now?: () => number;
}

/** A plain file, `false` for anything else, `null` when it is gone or unreadable. */
function lstatIsFile(path: string): boolean | null {
  try {
    return lstatSync(path).isFile();
  } catch {
    return null;
  }
}

/** Only documents go to the default app: it would run a script, an app or an installer. */
function isDocument(path: string): boolean {
  return DOCUMENT_EXTENSIONS.has(extname(path).slice(1).toLowerCase());
}

export interface EditorOpener {
  editors(): DetectedEditor[];
  open(editor: EditorChoice, path: string): Promise<void>;
}

/** Detection cached for a while: the buttons ask on every path they show. */
export function createEditorOpener(deps: EditorOpenerDeps): EditorOpener {
  const now = deps.now ?? Date.now;
  let cached: { at: number; located: Map<EditorId, EditorLaunch> } | null = null;
  const located = (): Map<EditorId, EditorLaunch> => {
    if (!cached || now() - cached.at > EDITOR_DETECT_TTL_MS) {
      cached = { at: now(), located: locateEditors(deps.detect()) };
    }
    return cached.located;
  };
  return {
    editors: () => describeEditors(located()),
    open: async (editor, path) => {
      if (editor === SYSTEM_EDITOR) {
        const file = (deps.isFile ?? lstatIsFile)(path);
        if (file === false || (file === true && !isDocument(path))) {
          await deps.reveal(path);
          return;
        }
        const failure = await deps.openPath(path);
        if (failure) throw new Error(failure);
        return;
      }
      const launch = located().get(editor);
      if (!launch) throw new Error(`${EDITOR_NAMES[editor]} was not found on this computer`);
      await startEditor(launch, path);
    },
  };
}
