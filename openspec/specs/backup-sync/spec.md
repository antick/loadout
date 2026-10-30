# backup-sync

## Purpose

Git backup of the skill library, sync with conflict review, snapshots, device restore, GitHub connection helpers, and compatibility checks for backup format versions.

## Requirements

### Requirement: Backup repository lifecycle

`BackupApi` SHALL initialize a Git repository in the library skills tree, set or remove remotes, clone or reclone from a URL, and report `BackupStatus` including sync state and auth method.

#### Scenario: First-time backup setup

- **WHEN** `init` runs on a library without a backup repo
- **THEN** a Git repository is created under the library skills directory suitable for push and pull

### Requirement: Sync with review gates

`BackupApi.sync` SHALL commit, merge, and push local changes, stopping with `SYNC_MANY_DELETES` when a sync would delete many local skills until the user supplies a review answer.

#### Scenario: Large delete preview

- **WHEN** preview shows many deletions and sync is called without review
- **THEN** sync refuses before modifying the library or remote

### Requirement: Conflict and diff tools

The backup service SHALL expose preview trees, per-skill diffs against remote commits, and conflict diffs between devices for skills marked in conflict.

#### Scenario: Inspect conflict before resolve

- **WHEN** `conflictDiff` is called for a conflicting skill key
- **THEN** the API returns structured diff content for the UI merge flow

### Requirement: Snapshots and restore

`BackupApi.snapshots` SHALL list recent snapshot commits, and restore operations SHALL validate snapshot ids and refuse unknown ids with the same errors as documented restore checks.

#### Scenario: List snapshots for backup page

- **WHEN** the backup UI requests snapshots with a limit
- **THEN** the API returns newest snapshots first up to that limit
