import type { SecretKind } from "@loadout/shared";

/**
 * Well-known key and token shapes, used both to hold back a backup and to scrub text that leaves
 * the machine (exported logs, bug reports). Only distinctive shapes: prose about keys passes.
 * Every pattern is global, so reset `lastIndex` or use `matchAll`/`replace`.
 */
export const SECRET_PATTERNS: readonly { kind: SecretKind; regex: RegExp }[] = [
  { kind: "private_key", regex: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { kind: "aws_key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "github_token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g },
  { kind: "anthropic_key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "openai_key", regex: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g },
  {
    kind: "slack_token",
    regex:
      /\b(?:xox[abposr]-|xapp-)[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g,
  },
  { kind: "google_key", regex: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { kind: "stripe_key", regex: /\b[rs]k_live_[0-9A-Za-z]{24,}/g },
  { kind: "npm_token", regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: "huggingface_token", regex: /\bhf_[A-Za-z0-9]{34,}\b/g },
];

/** A whole private key block, header to footer, for scrubbing text. */
export const PRIVATE_KEY_BLOCK =
  /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/g;
