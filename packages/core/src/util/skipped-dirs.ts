/**
 * Folders that hold installed dependencies or caches: large, and never where a project of the
 * user's lives. Skipped when looking for projects, and part of what a project's own files leave
 * out (`suggest/project-files.ts` adds build output and tool state to it).
 *
 * Kept apart on purpose: what a repository scan skips (`install/repo-scan.ts`: a repository may
 * publish skills from a build folder), what a content hash ignores (`util/hash.ts`: names that
 * are never skill content) and what a backup leaves out (`util/left-out.ts`: `.gitignore`
 * patterns the user can change).
 */
export const DEPENDENCY_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "vendor",
  "target",
  "__pycache__",
]);
