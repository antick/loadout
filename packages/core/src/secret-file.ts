import { readFileSync } from "node:fs";
import type { SecretStore } from "./context";
import { AppError } from "./errors";
import { writeFileAtomic } from "./util/fs";

export interface FileSecretStoreOptions {
  /** Whether a value can be kept right now; `set` refuses when not. Always, by default. */
  available?: () => boolean;
  /** What the file holds for a value; the value itself by default. */
  encode?: (value: string) => string;
  /** The value back from what the file holds; null when it cannot be read any more. */
  decode?: (stored: string) => string | null;
  /** Permission bits of the file; the process default when left out. */
  mode?: number;
}

const NO_STORE = "No secure credential store is available to keep this in.";

/**
 * Credentials as one JSON object in a file, each value stored as `encode` turns it. The desktop
 * app encodes with the OS keychain; the browser preview and tests keep the values as they are.
 */
export function createFileSecretStore(
  filePath: string,
  options: FileSecretStoreOptions = {},
): SecretStore {
  const available = options.available ?? (() => true);
  const encode = options.encode ?? ((value: string) => value);
  const decode = options.decode ?? ((stored: string) => stored);
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const write = (values: Record<string, string>): void =>
    writeFileAtomic(filePath, JSON.stringify(values, null, 2), options.mode);

  return {
    available,
    get: async (key) => {
      const stored = read()[key];
      return stored ? decode(stored) : null;
    },
    set: async (key, value) => {
      if (!available()) throw new AppError("CREDENTIALS_UNAVAILABLE", NO_STORE);
      write({ ...read(), [key]: encode(value) });
    },
    delete: async (key) => {
      const { [key]: _removed, ...rest } = read();
      write(rest);
    },
  };
}
