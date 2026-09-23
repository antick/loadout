import { type FSWatcher, existsSync, watch } from "node:fs";
import { sep } from "node:path";
import { WATCH_DEBOUNCE_MS, WATCH_RESCAN_MS, WATCH_SELF_WRITE_MUTE_MS } from "./constants";

export interface FolderWatcher {
  /** The app is about to write: ignore the filesystem echo of our own change. */
  mute(): void;
  stop(): void;
}

const IGNORED_SEGMENTS = [`${sep}.git${sep}`, `${sep}node_modules${sep}`];

/**
 * Watches folders (the library, agents' and projects' skills folders) so changes made outside the
 * app — by hand, by an agent, or through the CLI — show up without a manual refresh. The list is
 * asked for again every minute, so folders created later are picked up.
 */
export function watchFolders(resolvePaths: () => string[], onChange: () => void): FolderWatcher {
  const watchers = new Map<string, FSWatcher>();
  let timer: NodeJS.Timeout | null = null;
  let mutedUntil = 0;

  const fire = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (Date.now() >= mutedUntil) onChange();
    }, WATCH_DEBOUNCE_MS);
  };

  const rescan = (): void => {
    const wanted = new Set(resolvePaths().filter((path) => existsSync(path)));
    for (const [path, watcher] of watchers) {
      if (!wanted.has(path)) {
        watcher.close();
        watchers.delete(path);
      }
    }
    for (const path of wanted) {
      if (watchers.has(path)) continue;
      try {
        const watcher = watch(path, { recursive: true }, (_event, filename) => {
          const name = filename ? `${sep}${filename}${sep}` : "";
          if (IGNORED_SEGMENTS.some((segment) => name.includes(segment))) return;
          if (filename?.startsWith(`.git${sep}`) || filename === ".git") return;
          fire();
        });
        watcher.on("error", () => {
          watcher.close();
          watchers.delete(path);
        });
        watchers.set(path, watcher);
      } catch {
        // Unwatchable folder (permissions, platform limits): the manual refresh still works.
      }
    }
  };

  rescan();
  const interval = setInterval(rescan, WATCH_RESCAN_MS);
  interval.unref();

  return {
    mute: () => {
      mutedUntil = Date.now() + WATCH_SELF_WRITE_MUTE_MS;
    },
    stop: () => {
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
