import { APP_NAME, isNewerVersion } from "@loadout/shared";
import { AppError } from "../errors";
import {
  BACKUP_SCHEMA_VERSION,
  SCHEMA_FILE,
  type SchemaInfo,
  parseSchemaInfo,
} from "../skills/portable";
import type { BackupEnv } from "./env";

/**
 * Two computers can run different app versions against one backup. The backup's `schema.json`
 * says which metadata format it uses and the highest app version that wrote it. A format newer
 * than this app knows is never merged, cloned or restored; a newer app version on its own only
 * earns an upgrade reminder.
 */

/** `schema.json` as stored at a commit, tag or ref; null when it is missing or unreadable. */
export async function schemaAt(
  env: BackupEnv,
  revision: string,
  cwd?: string,
): Promise<SchemaInfo | null> {
  const result = await env.git.probe(
    ["show", `${revision}:${env.metadataName}/${SCHEMA_FILE}`],
    cwd ? { cwd } : {},
  );
  return result.code === 0 ? parseSchemaInfo(result.stdout) : null;
}

/** Throw when the metadata format is newer than this app can read. */
export function assertReadable(schema: SchemaInfo | null): void {
  if (!schema || schema.schemaVersion <= BACKUP_SCHEMA_VERSION) return;
  const version = schema.appVersion ? ` (${schema.appVersion})` : "";
  throw new AppError(
    "BACKUP_TOO_NEW",
    `This backup was saved by a newer version of ${APP_NAME}${version}. Update ${APP_NAME} on this computer, then sync again.`,
  );
}

/** The newest app version the schemas record, when it is newer than `current`. */
export function newerAppVersion(
  schemas: readonly (SchemaInfo | null)[],
  current: string,
): string | null {
  let newest: string | null = null;
  for (const schema of schemas) {
    const version = schema?.appVersion;
    if (version && isNewerVersion(version, newest ?? current)) newest = version;
  }
  return newest;
}
