import {
  DEFAULT_BACKUP_COMMIT_MESSAGE,
  type MergeSummary,
  type SyncPreview,
  type SyncPreviewItem,
  formatDateTime,
} from "@loadout/shared";
import { flagBoolean, flagInteger, flagString } from "../args";
import { fields, plural, table } from "../output";
import {
  ALLOW_SECRETS_FLAG,
  DRY_RUN_FLAG,
  REQUIRED_YES_FLAG,
  limitPositionals,
  positional,
  requireYes,
} from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const MESSAGE_FLAG = {
  name: "message",
  short: "m",
  type: "string",
  value: "text",
  description: `Commit message. Default: "${DEFAULT_BACKUP_COMMIT_MESSAGE}".`,
} as const;
const ALLOW_DELETES_FLAG = {
  name: "allow-deletes",
  type: "boolean",
  description:
    "Go ahead when the sync would delete many skills here. See them with --dry-run first.",
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
        ["Made", formatDateTime(value.lastCommitAt)],
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
  if (merge.removed.length > 0) {
    const names = merge.removed.map((skill) => `${skill.name} (${skill.fromDevice})`).join(", ");
    lines.push(`Deleted on other devices, kept in Recently removed: ${names}`);
  }
  if (merge.newConflicts.length > 0) {
    lines.push(
      `Changed on two devices, waiting for a choice in the app: ${merge.newConflicts.join(", ")}`,
    );
  }
  return lines;
}

function describeItem(item: SyncPreviewItem): string {
  const renamed = item.previousPath ? ` (was ${item.previousPath})` : "";
  const device = item.fromDevice ? `, from ${item.fromDevice}` : "";
  return `  ${item.change.padEnd(8)} ${item.name}${renamed}${device}`;
}

const section = (title: string, items: SyncPreviewItem[]): string[] =>
  items.length > 0 ? [`${title}:`, ...items.map(describeItem)] : [];

function describePreview(preview: SyncPreview): string[] {
  if (!preview.remoteCommit) return ["No remote branch yet: a sync pushes the whole library."];
  const lines = preview.perSkill
    ? [
        ...section("Coming in", preview.incoming),
        ...section("Going out", preview.outgoing),
        ...section("Changed on both sides, this computer's version stays", preview.conflicts),
      ]
    : [
        `${plural(preview.remoteBackups, "backup")} to merge. The backup remote lacks Loadout's skill details, so git merges them line by line.`,
        ...section("Coming in", preview.incoming),
      ];
  if (preview.presetsIncoming > 0) {
    lines.push(`${plural(preview.presetsIncoming, "preset")} updated from other devices.`);
  }
  if (preview.manyDeletes) {
    lines.push("That is many deletions: sync again with --allow-deletes to go ahead.");
  }
  return lines.length > 0 ? lines : ["Nothing to sync."];
}

async function sync({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const preview = await core.api.backup.preview();
    return {
      value: { dryRun: true, preview },
      text: [...describePreview(preview), "Nothing was changed."].join("\n"),
    };
  }
  if (flagBoolean(args, ALLOW_SECRETS_FLAG.name)) {
    const held = await core.api.backup.secretFindings();
    await core.api.backup.allowSecrets(held.map((finding) => finding.id));
  }
  // Going ahead past the deletion guard is a review answer like the app's, with nothing kept.
  const reviewed = flagBoolean(args, ALLOW_DELETES_FLAG.name)
    ? (await core.api.backup.preview()).remoteCommit
    : null;
  const value = await core.api.backup.sync(
    flagString(args, MESSAGE_FLAG.name),
    reviewed ? { remoteCommit: reviewed, keep: [] } : undefined,
  );
  const lines = [
    value.committed ? "Saved local changes." : "No local changes to save.",
    ...(value.merge ? describeMerge(value.merge) : []),
    value.pushed ? `Pushed${value.snapshot ? ` as ${value.snapshot}` : ""}.` : "Nothing to push.",
  ];
  return { value: { dryRun: false, ...value }, text: lines.join("\n") };
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
    value.map((s) => [s.id, formatDateTime(s.createdAt), s.device, s.message]),
    "No versions yet. `git sync` creates one.",
  );
  return { value, text };
}

async function restore({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const id = positional(args, 0, "the version to restore (see `git versions`)");
  // Core's own check, so the dry run and the real one refuse alike, and before asking for --yes.
  const point = await core.api.backup.restorePoint(id);
  requireYes(args, `switch the whole library back to ${point.id}`);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    return {
      value: { dryRun: true, id },
      text: `Would restore the library to ${point.id} (${formatDateTime(point.createdAt)}, ${point.message}), after saving the current state as a safety version. Nothing was changed.`,
    };
  }
  const safety = await core.api.backup.restore(id);
  return {
    value: { dryRun: false, id, restored: point.id, safetySnapshot: safety },
    text: `Library restored to ${point.id}. The state before that is kept as ${safety}.`,
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
      usage: "",
      flags: [MESSAGE_FLAG, ALLOW_SECRETS_FLAG, ALLOW_DELETES_FLAG, DRY_RUN_FLAG],
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
      usage: "",
      flags: [LIMIT_FLAG],
      run: versions,
    },
    {
      name: "restore",
      summary: "Switch the library back to a version",
      usage: "<version>",
      flags: [DRY_RUN_FLAG, REQUIRED_YES_FLAG],
      run: restore,
    },
  ],
};
