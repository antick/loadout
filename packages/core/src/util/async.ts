/**
 * Run `fn` over every item with at most `limit` calls in flight. Results keep the input order.
 * A rejection stops new work and rejects the whole call, so pass an `fn` that catches what it
 * wants to survive.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/** Wait without keeping the process alive: background work must never block an exit. */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}
