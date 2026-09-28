/** Backup types added after `types-system.ts`, kept apart to keep both files small. */

/**
 * What stays out of the backup, as `.gitignore` lines. `defaults` are the app's own and always
 * apply; `custom` are the user's, shared with every device through the backup.
 */
export interface BackupIgnoreRules {
  defaults: string[];
  custom: string[];
}

/** The user's answer to a sync review, sent with the sync it approves. */
export interface SyncReviewAnswer {
  /** The remote commit the review was made against. A sync against another one stops. */
  remoteCommit: string;
  /** Skills another device deleted that stay here instead, and go back to the remote. */
  keep: string[];
}
