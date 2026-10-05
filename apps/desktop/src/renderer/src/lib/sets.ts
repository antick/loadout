/** A copy of `set` with `id` added when it was missing and taken out when it was there. */
export function toggleIn<T>(set: ReadonlySet<T>, id: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** A copy of `set` with every one of `ids` added (`on`) or taken out. */
export function setMany<T>(set: ReadonlySet<T>, ids: Iterable<T>, on: boolean): Set<T> {
  const next = new Set(set);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}
