#!/usr/bin/env node
// Fails when a tracked file contains an em dash (U+2014). Write a comma, colon, full stop or
// parentheses instead. Built from its code point so this file does not trip the check itself.
import { execFileSync } from "node:child_process";

const EM_DASH = String.fromCodePoint(0x2014);
let output = "";
try {
  output = execFileSync("git", ["grep", "-n", "-I", "--untracked", "--exclude-standard", EM_DASH], {
    encoding: "utf8",
  });
} catch (error) {
  // git grep exits 1 when nothing matches.
  if (error.status === 1) process.exit(0);
  throw error;
}
console.error(`Em dashes found. Use a comma, colon, full stop or parentheses instead:\n${output}`);
process.exit(1);
