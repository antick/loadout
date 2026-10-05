import { safeStorage } from "electron";
import { type SecretStore, createFileSecretStore } from "@loadout/core";

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

function decrypt(cipher: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(cipher, "base64"));
  } catch {
    return null;
  }
}

/**
 * Credentials encrypted with the OS keychain (Keychain, DPAPI, libsecret) through Electron's
 * safeStorage. Only ciphertext reaches the disk.
 */
export function createSecretStore(filePath: string): SecretStore {
  return createFileSecretStore(filePath, {
    available: encryptionUsable,
    encode: (value) => safeStorage.encryptString(value).toString("base64"),
    decode: decrypt,
    mode: SECRETS_FILE_MODE,
  });
}
