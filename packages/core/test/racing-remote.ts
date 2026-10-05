import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A remote that another push reaches first. Loadout is given an `ssh://` address, and the program
 * standing in for ssh runs `race` (a shell snippet pushing from a second clone) the moment a push
 * connects, after the sync or publish has fetched. Git itself opens the window, so the race is the
 * same every time. Fetches and clones go straight through. `race` sees the round it runs in as
 * `$ROUND`, from 1.
 */

const SSH_STAND_IN = "ssh-stand-in";
const RACE_COUNT_FILE = "race-count";
/** Rounds the other push may win when the caller sets no limit: as good as always. */
const UNLIMITED = 1000;

export interface RacingRemote {
  /** The address to give Loadout. */
  url: string;
  /** How often the other push went first. */
  count(): number;
  /** Put ssh back: the stand-in is set through the environment. */
  stop(): void;
}

export function racingRemote(
  dir: string,
  bare: string,
  race: string,
  options: { times?: number } = {},
): RacingRemote {
  const counter = join(dir, RACE_COUNT_FILE);
  const script = join(dir, SSH_STAND_IN);
  writeFileSync(
    script,
    [
      "#!/bin/sh",
      // Git asks `-G` to see whether this is OpenSSH; a failure means plain host and command.
      '[ "$1" = "-G" ] && exit 1',
      "for last; do :; done",
      'case "$last" in',
      '  "git-receive-pack "*)',
      `    round=$(grep -c '' "${counter}" 2>/dev/null || echo 0)`,
      `    if [ "$round" -lt ${options.times ?? UNLIMITED} ]; then`,
      `      echo >> "${counter}"`,
      "      ROUND=$((round + 1)); export ROUND",
      // Its output must stay out of git's protocol stream.
      `      ( ${race} ) >&2 || exit 1`,
      "    fi ;;",
      "esac",
      'exec sh -c "git ${last#git-}"',
    ].join("\n"),
    { mode: 0o755 },
  );
  chmodSync(script, 0o755);
  const saved = process.env.GIT_SSH;
  process.env.GIT_SSH = script;
  return {
    url: `ssh://localhost${bare}`,
    count: () => (existsSync(counter) ? readFileSync(counter, "utf8").split("\n").length - 1 : 0),
    stop: () => {
      if (saved === undefined) delete process.env.GIT_SSH;
      else process.env.GIT_SSH = saved;
    },
  };
}
