/**
 * A skill's tags after adding and removing some, as the CLI's `skills tag` and the app's batch
 * tag dialog both edit them: its own tags first, in their order, then the new ones. Letter case
 * is ignored, so removing `Work` takes `work` off and adding `work` next to `Work` adds nothing.
 */
export function editTags(
  current: readonly string[],
  add: readonly string[],
  remove: readonly string[],
): string[] {
  const dropped = new Set(remove.map((tag) => tag.trim().toLowerCase()));
  const next: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...current, ...add]) {
    const clean = tag.trim();
    const key = clean.toLowerCase();
    if (!clean || dropped.has(key) || seen.has(key)) continue;
    seen.add(key);
    next.push(clean);
  }
  return next;
}
