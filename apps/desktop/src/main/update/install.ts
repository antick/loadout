import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Replaces the app once it has exited, then starts the new one. Run by `/bin/sh` detached from
 * the app. Arguments: app pid, what to replace, the new copy, log file, seconds to wait for the
 * exit, and `bundle` (a macOS `.app` folder, started with `open`) or `file` (an AppImage).
 * Kept as text so it runs without anything from the app: the app is gone while it works.
 */
export const SWAP_SCRIPT = `
pid="$1"; target="$2"; staged="$3"; log="$4"; wait_s="$5"; kind="$6"
exec >>"$log" 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') update: waiting for the app ($pid) to exit"
tries=0
while kill -0 "$pid" 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -gt $((wait_s * 5)) ]; then
    echo "update: the app did not exit; nothing was replaced"
    exit 1
  fi
  sleep 0.2
done
backup="$target.previous-$$"
if mv "$target" "$backup"; then
  if mv "$staged" "$target"; then
    rm -rf "$backup"
    echo "update: replaced $target"
  else
    echo "update: could not move the new version in; the old one is back"
    mv "$backup" "$target"
  fi
else
  echo "update: could not move $target aside; nothing was replaced"
fi
if [ "$kind" = "bundle" ]; then
  open "$target"
else
  chmod 755 "$target"
  unset APPDIR APPIMAGE ARGV0 OWD
  nohup "$target" >/dev/null 2>&1 &
fi
`;

/**
 * Waits for the app to exit, then runs the installer silently. `--updated` tells the installer this
 * is an update and `--force-run` starts the app once it is done. Paths arrive through the
 * environment, so nothing needs quoting.
 */
export const WINDOWS_INSTALL_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "Wait-Process -Id ([int]$env:LOADOUT_UPDATE_PID) -Timeout ([int]$env:LOADOUT_UPDATE_WAIT)",
  "Start-Process -FilePath $env:LOADOUT_UPDATE_INSTALLER -ArgumentList '--updated','/S','--force-run'",
].join("; ");

export interface MacBundleCheck {
  bundleId: string;
  version: string;
}

async function plistValue(plist: string, key: string): Promise<string> {
  const { stdout } = await run("plutil", ["-extract", key, "raw", "-o", "-", plist]);
  return stdout.trim();
}

/**
 * Unpack a macOS release zip into `stageDir` and make sure it is the app we expect: same bundle
 * id, the version the feed announced, and an intact code signature. `ditto` keeps the symbolic
 * links inside Electron's frameworks, which other unzip tools flatten.
 */
export async function prepareMacBundle(
  zip: string,
  stageDir: string,
  expected: MacBundleCheck,
): Promise<string> {
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  await run("ditto", ["-x", "-k", zip, stageDir]);
  const bundleName = (await readdir(stageDir)).find((name) => name.endsWith(".app"));
  if (!bundleName) throw new Error("The download holds no app");
  const bundle = join(stageDir, bundleName);
  const plist = join(bundle, "Contents", "Info.plist");
  if ((await plistValue(plist, "CFBundleIdentifier")) !== expected.bundleId) {
    throw new Error("The download is not this app");
  }
  if ((await plistValue(plist, "CFBundleShortVersionString")) !== expected.version) {
    throw new Error("The download is a different version than the release says");
  }
  try {
    await run("codesign", ["--verify", "--deep", "--strict", bundle]);
  } catch {
    throw new Error("The downloaded app is damaged (its signature does not check out)");
  }
  // Files this app downloads carry no quarantine flag; clear it anyway so macOS never asks.
  await run("xattr", ["-dr", "com.apple.quarantine", bundle]).catch(() => undefined);
  return bundle;
}

export async function prepareAppImage(file: string): Promise<string> {
  await chmod(file, 0o755);
  return file;
}

export interface SwapJob {
  pid: number;
  target: string;
  staged: string;
  logFile: string;
  waitSeconds: number;
  kind: "bundle" | "file";
}

/** Start the replacement in a process that outlives the app. The app must quit right after. */
export function startSwap(job: SwapJob): void {
  const args = [
    "-c",
    SWAP_SCRIPT,
    "sh",
    String(job.pid),
    job.target,
    job.staged,
    job.logFile,
    String(job.waitSeconds),
    job.kind,
  ];
  spawn("/bin/sh", args, { detached: true, stdio: "ignore" }).unref();
}

export interface InstallerJob {
  pid: number;
  installer: string;
  waitSeconds: number;
}

/** Start the Windows installer once the app has exited. The app must quit right after. */
export function startWindowsInstaller(job: InstallerJob): void {
  spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-Command",
      WINDOWS_INSTALL_SCRIPT,
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        LOADOUT_UPDATE_PID: String(job.pid),
        LOADOUT_UPDATE_INSTALLER: job.installer,
        LOADOUT_UPDATE_WAIT: String(job.waitSeconds),
      },
    },
  ).unref();
}
