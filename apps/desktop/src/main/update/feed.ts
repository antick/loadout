import { createPublicKey, verify } from "node:crypto";
import type { UpdateTarget } from "@loadout/shared";

/** The build key for a platform and processor. Null when no build is published for it. */
export function updateTargetFor(
  platform: NodeJS.Platform,
  arch: string,
  isAppImage: boolean,
): UpdateTarget | null {
  if (arch !== "x64" && arch !== "arm64") return null;
  if (platform === "darwin") return `darwin-${arch}`;
  if (platform === "win32") return `win32-${arch}`;
  if (platform === "linux") return `linux-${arch}-${isAppImage ? "appimage" : "deb"}`;
  return null;
}

/** The feed's bytes carry a valid ed25519 signature from the release key. */
export function isFeedSignedBy(
  feed: Uint8Array,
  signatureBase64: string,
  publicKey: string,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    return verify(null, feed, key, Buffer.from(signatureBase64.trim(), "base64"));
  } catch {
    return false;
  }
}
