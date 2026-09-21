import type { BackupStatus } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { deriveBackupMode } from "./backup-mode";

const healthy: BackupStatus = {
  isRepo: true,
  remoteUrl: "https://example.com/me/backup.git",
  branch: "main",
  hasChanges: false,
  changedSkillCount: 0,
  ahead: 0,
  behind: 0,
  lastCommit: "backup",
  lastCommitAt: 1,
  currentSnapshot: null,
  restoredFrom: null,
  upstreamHealth: "healthy",
  gitAvailable: true,
  newerAppVersion: null,
};

describe("deriveBackupMode", () => {
  it("is loading until the status arrives", () => {
    expect(deriveBackupMode(undefined, null, null)).toEqual({ kind: "loading" });
  });

  it("asks for git before anything else", () => {
    const status = { ...healthy, gitAvailable: false, isRepo: false };
    expect(deriveBackupMode(status, null, null).kind).toBe("git_missing");
  });

  it("carries a saved remote while there is no repository yet", () => {
    const status: BackupStatus = { ...healthy, isRepo: false, remoteUrl: null };
    expect(deriveBackupMode(status, "https://example.com/x.git", null)).toEqual({
      kind: "not_set_up",
      savedRemote: "https://example.com/x.git",
    });
  });

  it("needs a remote when the repository has none", () => {
    const status: BackupStatus = { ...healthy, remoteUrl: null, upstreamHealth: "no_remote" };
    expect(deriveBackupMode(status, null, null)).toEqual({
      kind: "needs_remote",
      savedRemote: null,
    });
  });

  it("puts a broken setup before a failed action", () => {
    const status: BackupStatus = { ...healthy, upstreamHealth: "unrelated_histories" };
    expect(deriveBackupMode(status, null, new Error("push failed"))).toEqual({
      kind: "needs_fix",
      reason: "unrelated_histories",
    });
    expect(deriveBackupMode({ ...healthy, upstreamHealth: "detached" }, null, null)).toEqual({
      kind: "needs_fix",
      reason: "detached",
    });
  });

  it("reports the last failure until it is cleared", () => {
    expect(deriveBackupMode({ ...healthy, hasChanges: true }, null, new Error("x")).kind).toBe(
      "failed",
    );
  });

  it("tells local, remote and two-sided changes apart", () => {
    expect(deriveBackupMode({ ...healthy, hasChanges: true }, null, null)).toEqual({
      kind: "pending",
      side: "local",
    });
    expect(deriveBackupMode({ ...healthy, ahead: 2 }, null, null)).toEqual({
      kind: "pending",
      side: "local",
    });
    expect(deriveBackupMode({ ...healthy, upstreamHealth: "no_upstream" }, null, null)).toEqual({
      kind: "pending",
      side: "local",
    });
    expect(deriveBackupMode({ ...healthy, behind: 1 }, null, null)).toEqual({
      kind: "pending",
      side: "remote",
    });
    expect(deriveBackupMode({ ...healthy, behind: 1, hasChanges: true }, null, null)).toEqual({
      kind: "pending",
      side: "both",
    });
  });

  it("is up to date when nothing is waiting", () => {
    expect(deriveBackupMode(healthy, null, null)).toEqual({ kind: "up_to_date" });
  });
});
