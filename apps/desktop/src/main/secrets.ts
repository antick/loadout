import { existsSync, readFileSync } from "node:fs";
import { safeStorage } from "electron";
import { type SecretStore, writeFileAtomic } from "@loadout/core";

/** Only the user may read the encrypted secrets file. */
const SECRETS_FILE_MODE = 0o600;

/**
 * Real encryption only. On Linux without a keyring, Electron falls back to `basic_text`, a fixed
 * key anyone can undo, while still calling encryption available: treat that as unavailable.
 */
function encryptionUsable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
}

/**
 * Credentials encrypted with the OS keychain (Keychain, DPAPI, libsecret) through Electron's
 * safeStorage. Only ciphertext reaches the disk.
 */
export function createSecretStore(filePath: string): SecretStore {
  const read = (): Record<string, string> => {
    if (!existsSync(filePath)) return {};
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const write = (data: Record<string, string>): void =>
    writeFileAtomic(filePath, JSON.stringify(data, null, 2), SECRETS_FILE_MODE);

  return {
    available: encryptionUsable,
    get: async (key) => {
      const cipher = read()[key];
      if (!cipher || !safeStorage.isEncryptionAvailable()) return null;
      try {
        return safeStorage.decryptString(Buffer.from(cipher, "base64"));
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      if (!encryptionUsable()) {
        throw new Error("The system keychain is not available");
      }
      write({ ...read(), [key]: safeStorage.encryptString(value).toString("base64") });
    },
    delete: async (key) => {
      const { [key]: _removed, ...rest } = read();
      write(rest);
    },
  };
}
