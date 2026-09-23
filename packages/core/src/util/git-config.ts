/**
 * Git settings that keep a skill's files byte for byte as they are in the repository. Without
 * them Git for Windows (`core.autocrlf=true` by default) turns LF into CRLF on checkout, so the
 * same skill hashes differently per machine and its shell scripts stop running.
 */
export const BYTE_EXACT_CONFIG = ["core.autocrlf=false"] as const;

/** `-c key=value` pairs for the front of a git command line. */
export const configFlags = (entries: readonly string[]): string[] =>
  entries.flatMap((entry) => ["-c", entry]);

/** Settings that send Git's HTTP(S) traffic through `proxy`. None without one. */
export const proxyConfig = (proxy: string | null | undefined): string[] =>
  proxy ? [`http.proxy=${proxy}`, `https.proxy=${proxy}`] : [];
