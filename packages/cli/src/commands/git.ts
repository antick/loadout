import { notFound } from "@loadout/core";
import { DEFAULT_BACKUP_COMMIT_MESSAGE, type MergeSummary } from "@loadout/shared";
import { flagBoolean, flagInteger, flagString } from "../args";
import { fields, plural, table, when } from "../output";
import { DRY_RUN_FLAG, YES_FLAG, limitPositionals, positional, requireYes } from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const MESSAGE_FLAG = {
  name: "message",
  short: "m",
  type: "string",
  value: "text",
  description: `Commit message. Default: "${DEFAULT_BACKUP_COMMIT_MESSAGE}".`,
} as const;
const LIMIT_FLAG = {
  name: "limit",
  type: "string",
  value: "n",
  description: "How many versions to list.",
} as const;

async function status({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const value = await core.api.backup.status();
  const text = value.isRepo
    ? fields([
        ["Remote", value.remoteUrl ?? "none"],
        ["Branch", value.branch],
        ["Health", value.upstreamHealth],
        ["Unsaved changes", value.hasChanges ? plural(value.changedSkillCount, "skill") : "none"],
        ["Ahead / behind", `${value.ahead} / ${value.behind}`],
        ["Last backup", value.lastCommit],
        ["Made", when(value.lastCommitAt)],
        ["Version", value.currentSnapshot],
        ["Restored from", value.restoredFrom],
      ])
    : `The library is not backed up yet. Run \`git init\`.${value.gitAvailable ? "" : " (git is not installed.)"}`;
  return { value, text };
}

async function init({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  await core.api.backup.init();
  return {
    value: await core.api.backup.status(),
    text: "Backup repository created in the library.",
  };
}

async function remote({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const url = await core.api.backup.setRemote(positional(args, 0, "the remote URL"));
  return { value: { remoteUrl: url }, text: `Backups now go to ${url}.` };
}

function describeMerge(merge: MergeSummary): string[] {
  if (merge.upToDate) return ["Nothing new on the remote."];
  const lines = [
    `${plural(merge.updated.length, "skill")} updated from other devices, ${merge.keptLocal.length} kept as they are here.`,
  ];
  if (merge.newConflicts.length > 0) {
    lines.push(
      `Changed on two devices, waiting for a choice in the app: ${merge.newConflicts.join(", ")}`,
    );
  }
  return lines;
}

async function sync({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const value = await core.api.backup.sync(flagString(args, MESSAGE_FLAG.name));
  const lines = [
    value.committed ? "Saved local changes." : "No local changes to save.",
    ...(value.merge ? describeMerge(value.merge) : []),
    value.pushed ? `Pushed${value.snapshot ? ` as ${value.snapshot}` : ""}.` : "Nothing to push.",
  ];
  return { value, text: lines.join("\n") };
}

async function pull({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const value = await core.api.backup.pull();
  return { value, text: describeMerge(value).join("\n") };
}

async function versions({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const value = await core.api.backup.snapshots(flagInteger(args, LIMIT_FLAG.name));
  const text = table(
    ["version", "made", "device", "message"],
    value.map((s) => [s.tag, when(s.createdAt), s.device, s.message]),
    "No versions yet. `git sync` creates one.",
  );
  return { value, text };
}

async function restore({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const tag = positional(args, 0, "the version to restore (see `git versions`)");
  requireYes(args, `switch the whole library back to ${tag}`);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const known = (await core.api.backup.snapshots()).some((snapshot) => snapshot.tag === tag);
    if (!known) throw notFound(`No version called ${tag}.`);
    return {
      value: { dryRun: true, tag },
      text: `Would restore the library to ${tag}, after saving the current state as a safety version. Nothing was changed.`,
    };
  }
  const safety = await core.api.backup.restore(tag);
  return {
    value: { dryRun: false, restored: tag, safetySnapshot: safety },
    text: `Library restored to ${tag}. The state before that is kept as ${safety}.`,
  };
}

export const gitGroup: CommandGroup = {
  name: "git",
  summary: "Back up the library to a git remote and restore versions",
  commands: [
    { name: "status", summary: "Show the backup state", usage: "", flags: [], run: status },
    { name: "init", summary: "Start backing up the library", usage: "", flags: [], run: init },
    {
      name: "remote",
      summary: "Set where backups are pushed",
      usage: "<url>",
      flags: [],
      run: remote,
    },
    {
      name: "sync",
      summary: "Save, merge what other devices pushed, and push",
      usage: "[-m <message>]",
      flags: [MESSAGE_FLAG],
      run: sync,
    },
    {
      name: "pull",
      summary: "Merge what other devices pushed, without pushing",
      usage: "",
      flags: [],
      run: pull,
    },
    {
      name: "versions",
      summary: "List restorable versions, newest first",
      usage: "[--limit <n>]",
      flags: [LIMIT_FLAG],
      run: versions,
    },
    {
      name: "restore",
      summary: "Switch the library back to a version",
      usage: "<tag> --yes [--dry-run]",
      flags: [YES_FLAG, DRY_RUN_FLAG],
      run: restore,
    },
  ],
};
