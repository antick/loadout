import { existsSync, readFileSync } from "node:fs";
import { safeStorage } from "electron";
import type { SecretStore } from "@loadout/core";
import { writeFileAtomicSync } from "./files";

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
    writeFileAtomicSync(filePath, JSON.stringify(data, null, 2));

  return {
    available: () => safeStorage.isEncryptionAvailable(),
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
      if (!safeStorage.isEncryptionAvailable()) {
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
