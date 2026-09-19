import { hostname } from "node:os";
import { APP_SLUG } from "@skillboard/shared";
import { invalid } from "../errors";
import { INTERNAL_KEYS, type SettingsStore } from "../settings/store";
import { slugify } from "../util/names";

/**
 * The device name is what other devices see next to a snapshot or a merged skill. It is written
 * as the commit author, so renaming only affects future commits.
 */

const MAX_DEVICE_NAME_LENGTH = 64;
const FALLBACK_DEVICE_NAME = "My Computer";
const LOCAL_SUFFIX = /\.local$/i;
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

/** Drop control characters and angle brackets (git rejects them in identities), collapse spaces. */
export function sanitizeDeviceName(input: string): string {
  let cleaned = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const control = code <= LAST_CONTROL_CODE || code === DELETE_CODE;
    cleaned += control || ch === "<" || ch === ">" ? " " : ch;
  }
  return [...cleaned.replace(/\s+/g, " ").trim()].slice(0, MAX_DEVICE_NAME_LENGTH).join("").trim();
}

function defaultDeviceName(): string {
  return sanitizeDeviceName(hostname().replace(LOCAL_SUFFIX, "")) || FALLBACK_DEVICE_NAME;
}

/** The saved name, or the host name (saved on first use so it stays stable if the host is renamed). */
export function readDeviceName(settings: SettingsStore): string {
  const saved = sanitizeDeviceName(settings.getRaw<string>(INTERNAL_KEYS.backupDeviceName, ""));
  if (saved) return saved;
  const name = defaultDeviceName();
  settings.setRaw(INTERNAL_KEYS.backupDeviceName, name);
  return name;
}

export function writeDeviceName(settings: SettingsStore, input: string): string {
  const name = sanitizeDeviceName(input);
  if (!name) throw invalid("The device name cannot be empty.");
  settings.setRaw(INTERNAL_KEYS.backupDeviceName, name);
  return name;
}

/** Commit e-mail for a device. Never a real address: it only has to be stable and valid. */
export function deviceEmail(deviceName: string): string {
  return `${APP_SLUG}@${slugify(deviceName)}.local`;
}
