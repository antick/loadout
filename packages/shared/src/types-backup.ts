/** Backup types added after `types-system.ts`, kept apart to keep both files small. */

/**
 * What stays out of the backup, as `.gitignore` lines. `defaults` are the app's own and always
 * apply; `custom` are the user's, shared with every device through the backup.
 */
export interface BackupIgnoreRules {
  defaults: string[];
  custom: string[];
}
