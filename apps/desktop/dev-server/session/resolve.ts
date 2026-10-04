/** Node resolve hook: a relative import without an extension finds its `.ts` file or folder. */
const TS_SUFFIXES = [".ts", "/index.ts"];

type Resolved = { url: string };
type Next = (specifier: string, context: unknown) => Promise<Resolved>;

export async function resolve(specifier: string, context: unknown, next: Next): Promise<Resolved> {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".")) throw error;
    for (const suffix of TS_SUFFIXES) {
      const found = await next(`${specifier}${suffix}`, context).catch(() => null);
      if (found) return found;
    }
    throw error;
  }
}
