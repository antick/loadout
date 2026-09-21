import { readFileSync } from "node:fs";
import type { FileDiffEntry, FileDiffKind } from "@loadout/shared";
import { type ContentFile, listContentFiles } from "../util/hash";

/** Files larger than this are compared but never sent to the UI as text. */
export const MAX_DIFF_TEXT_BYTES = 256 * 1024;
const NUL = 0;

type SideKind = Exclude<FileDiffKind, "permission_only">;

interface Side {
  kind: SideKind;
  /** Null when the file could not be read. */
  bytes: Buffer | null;
  text: string | null;
  executable: boolean;
}

function decodeText(bytes: Buffer): string | null {
  if (bytes.includes(NUL)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function readSide(file: ContentFile): Side {
  let bytes: Buffer | null = null;
  try {
    bytes = readFileSync(file.absolutePath);
  } catch {
    // Shown as binary: we cannot say anything about its text.
  }
  const base = { bytes, executable: file.executable };
  if (file.size > MAX_DIFF_TEXT_BYTES) return { ...base, kind: "too_large", text: null };
  const text = bytes ? decodeText(bytes) : null;
  return { ...base, kind: text === null ? "binary" : "text", text };
}

function sameBytes(before: Side, after: Side): boolean {
  return before.bytes !== null && after.bytes !== null && before.bytes.equals(after.bytes);
}

/** A changed pair shows as text only when both sides are; size wins over binary. */
function modifiedKind(before: Side, after: Side): SideKind {
  if (before.kind === "text" && after.kind === "text") return "text";
  return before.kind === "too_large" || after.kind === "too_large" ? "too_large" : "binary";
}

function oneSided(path: string, side: Side, status: "added" | "removed"): FileDiffEntry {
  const added = status === "added";
  return {
    path,
    status,
    kind: side.kind,
    before: added ? null : side.text,
    after: added ? side.text : null,
    executableBefore: !added && side.executable,
    executableAfter: added && side.executable,
  };
}

/**
 * Compare two skill folders over exactly the files the content hash covers, sorted by path.
 * Identical files are left out; a file whose bytes match but whose executable bit differs is
 * reported as `permission_only`. Text bodies are included only for `text` entries.
 */
export function diffTrees(beforeDir: string, afterDir: string): FileDiffEntry[] {
  const before = new Map(listContentFiles(beforeDir).map((file) => [file.relativePath, file]));
  const after = new Map(listContentFiles(afterDir).map((file) => [file.relativePath, file]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => (a < b ? -1 : 1));

  const entries: FileDiffEntry[] = [];
  for (const path of paths) {
    const beforeFile = before.get(path);
    const afterFile = after.get(path);
    if (!beforeFile && afterFile) entries.push(oneSided(path, readSide(afterFile), "added"));
    if (beforeFile && !afterFile) entries.push(oneSided(path, readSide(beforeFile), "removed"));
    if (!beforeFile || !afterFile) continue;

    const left = readSide(beforeFile);
    const right = readSide(afterFile);
    const identical = sameBytes(left, right);
    if (identical && left.executable === right.executable) continue;
    const kind: FileDiffKind = identical ? "permission_only" : modifiedKind(left, right);
    entries.push({
      path,
      status: "modified",
      kind,
      before: kind === "text" ? left.text : null,
      after: kind === "text" ? right.text : null,
      executableBefore: left.executable,
      executableAfter: right.executable,
    });
  }
  return entries;
}
