/**
 * Many git objects read in one `git cat-file` process instead of one process each. Names go in
 * a line at a time; the answers come back in the same order.
 */

const NEWLINE = 0x0a;
const BATCH_HEADER = /^[0-9a-f]+ (\w+) (\d+)$/;
const MISSING_SUFFIX = " missing";

/** Format for `--batch-check` that asks for the object's id alone, so git never opens it. */
export const OBJECT_NAME_FORMAT = "%(objectname)";

/** Whether `cat-file` can be asked for this name: it reads one name per line. */
export function isBatchName(name: string): boolean {
  return !name.includes("\n") && !name.endsWith("\r");
}

/** What `cat-file` reads: one name per line. */
export function batchInput(names: readonly string[]): string {
  return names.map((name) => `${name}\n`).join("");
}

/**
 * The contents `git cat-file --batch` gave for each of `count` names, in order: null for one git
 * says is missing, and for every name after an answer that stopped early. Read as bytes: the
 * sizes in the headers count bytes. Throws `garbled(header)` on a header it cannot read, since
 * guessing past it would hand later names the wrong contents.
 */
export function parseBatch(
  bytes: Buffer,
  count: number,
  garbled: (header: string) => Error,
): (Buffer | null)[] {
  const contents: (Buffer | null)[] = [];
  let offset = 0;
  while (contents.length < count) {
    const lineEnd = bytes.indexOf(NEWLINE, offset);
    if (lineEnd === -1) break;
    const header = bytes.subarray(offset, lineEnd).toString("utf8");
    offset = lineEnd + 1;
    if (header.endsWith(MISSING_SUFFIX)) {
      contents.push(null);
      continue;
    }
    const size = Number(BATCH_HEADER.exec(header)?.[2] ?? Number.NaN);
    if (!Number.isInteger(size)) throw garbled(header);
    contents.push(bytes.subarray(offset, offset + size));
    offset += size + 1;
  }
  while (contents.length < count) contents.push(null);
  return contents;
}

/**
 * The object ids `git cat-file --batch-check=%(objectname)` gave for each of `count` names, in
 * order; null for one git says is missing.
 */
export function parseBatchCheck(stdout: string, count: number): (string | null)[] {
  const lines = stdout.split("\n");
  return Array.from({ length: count }, (_, index) => {
    const line = lines[index]?.trim() ?? "";
    return line && !line.endsWith(MISSING_SUFFIX) ? line : null;
  });
}
