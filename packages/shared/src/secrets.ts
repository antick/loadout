/** What a backup refuses to push until the user says so: text that looks like a key or token. */

export const SECRET_KINDS = [
  "private_key",
  "aws_key",
  "github_token",
  "gitlab_token",
  "anthropic_key",
  "openai_key",
  "slack_token",
  "google_key",
  "stripe_key",
  "npm_token",
  "huggingface_token",
] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];

/** One match in a file the next backup would push. The secret itself never leaves core. */
export interface SecretFinding {
  /** Stable for the same text in the same file; what "Back up anyway" remembers. */
  id: string;
  /** Repository-relative, `/` separated, e.g. `code-review/SKILL.md`. */
  file: string;
  /** Absolute path, to open or show the file. */
  path: string;
  line: number;
  kind: SecretKind;
  /** The first and last few characters, the rest hidden. */
  masked: string;
  /**
   * Already in a commit this computer has not pushed yet: removing it from the file no longer
   * keeps it out of the push.
   */
  committed: boolean;
}

/** `scheme://user:password@` at the start of an address: the credentials Git URLs can carry. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

/**
 * Every URL in `text` without the credentials it carries (`https://host/...`), or with `mask`
 * standing in for them (`***@`), so an address can be shown or logged.
 */
export function redactUrl(text: string, mask = ""): string {
  return text.replace(URL_CREDENTIALS, `$1${mask}`);
}
