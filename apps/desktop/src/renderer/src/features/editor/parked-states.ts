/**
 * Park a document's editor state when the editor switches away from it, and keep at most `max`
 * of them: the ones left longest ago go first, but never one listed in `keep` (unsaved changes),
 * whose undo history must not be lost.
 */
export function parkState<T>(
  parked: Map<string, T>,
  key: string,
  state: T,
  max: number,
  keep: ReadonlySet<string>,
): void {
  // Deleted first, so a Map's insertion order is also the order the documents were left in.
  parked.delete(key);
  parked.set(key, state);
  // Deleting while iterating a Map is safe: later entries are still visited.
  for (const oldest of parked.keys()) {
    if (parked.size <= max) return;
    if (!keep.has(oldest)) parked.delete(oldest);
  }
}
