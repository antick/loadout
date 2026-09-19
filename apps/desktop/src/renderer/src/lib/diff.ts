import { structuredPatch } from "diff";
import { DIFF_CONTEXT_LINES } from "@/lib/constants";

export type DiffLineKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface LineDiff {
  hunks: DiffHunk[];
  added: number;
  removed: number;
}

const NO_NEWLINE_MARKER = "\\";

/** Unified line diff of two texts, grouped in hunks with a few lines of context around changes. */
export function computeLineDiff(
  before: string,
  after: string,
  context: number = DIFF_CONTEXT_LINES,
): LineDiff {
  const patch = structuredPatch("before", "after", before, after, "", "", { context });
  let added = 0;
  let removed = 0;

  const hunks = patch.hunks.map((hunk): DiffHunk => {
    let oldNumber = hunk.oldStart;
    let newNumber = hunk.newStart;
    const lines: DiffLine[] = [];
    for (const raw of hunk.lines) {
      const marker = raw.charAt(0);
      const text = raw.slice(1);
      if (marker === NO_NEWLINE_MARKER) continue;
      if (marker === "+") {
        lines.push({ kind: "added", text, oldNumber: null, newNumber });
        newNumber += 1;
        added += 1;
      } else if (marker === "-") {
        lines.push({ kind: "removed", text, oldNumber, newNumber: null });
        oldNumber += 1;
        removed += 1;
      } else {
        lines.push({ kind: "context", text, oldNumber, newNumber });
        oldNumber += 1;
        newNumber += 1;
      }
    }
    return {
      header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      lines,
    };
  });
  return { hunks, added, removed };
}
