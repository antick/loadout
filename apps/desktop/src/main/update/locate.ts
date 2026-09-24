import { accessSync, constants } from "node:fs";
import { dirname, posix } from "node:path";
import type { AppUpdateBlocker, AppUpdateMethod } from "@loadout/shared";

/** Where the running app lives and how it can be replaced. */
export interface AppLocation {
  method: AppUpdateMethod;
  /** What gets replaced: the `.app` bundle on macOS, the AppImage file on Linux. */
  target: string | null;
  blocker: AppUpdateBlocker | null;
}

export interface LocateInput {
  platform: NodeJS.Platform;
  /** `process.execPath`. */
  execPath: string;
  /** `process.env.APPIMAGE`: set by the AppImage runtime to the AppImage file. */
  appImage: string | undefined;
  packaged: boolean;
  /** Can this user write `path`? Injected for tests. */
  writable?(path: string): boolean;
}

function canWrite(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** `/Applications/Loadout.app/Contents/MacOS/Loadout` → `/Applications/Loadout.app`. */
function macBundle(execPath: string): string | null {
  const bundle = posix.resolve(execPath, "..", "..", "..");
  return bundle.endsWith(".app") ? bundle : null;
}

export function locateApp(input: LocateInput): AppLocation {
  const writable = input.writable ?? canWrite;
  const devBlocker: AppUpdateBlocker | null = input.packaged ? null : "development";

  if (input.platform === "darwin") {
    const bundle = macBundle(input.execPath);
    let blocker: AppUpdateBlocker | null = devBlocker;
    if (!blocker && !bundle) blocker = "read_only";
    else if (!blocker && bundle?.includes("/AppTranslocation/")) blocker = "translocated";
    else if (!blocker && bundle?.startsWith("/Volumes/") && !writable(bundle)) {
      blocker = "disk_image";
    } else if (!blocker && bundle && !(writable(bundle) && writable(posix.dirname(bundle)))) {
      blocker = "read_only";
    }
    return { method: "replace", target: bundle, blocker };
  }

  if (input.platform === "win32") return { method: "installer", target: null, blocker: devBlocker };

  if (input.appImage) {
    const blocker = devBlocker ?? (writable(dirname(input.appImage)) ? null : "read_only");
    return { method: "replace", target: input.appImage, blocker };
  }
  return { method: "package", target: null, blocker: devBlocker };
}
