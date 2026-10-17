import { join } from "node:path";
import {
  APP_DATA_DIR_NAME,
  APP_ID,
  APP_NAME,
  DEV_APP_ID,
  DEV_APP_NAME,
  DEV_HOME_DIR_NAME,
  LIBRARY_DIR_NAME,
} from "@loadout/shared";

/** Development owns an entire home, including the core library and agent discovery. */
export function appProfile(packaged: boolean, home: string) {
  const homeDir = packaged ? home : join(home, DEV_HOME_DIR_NAME);
  return {
    name: packaged ? APP_NAME : DEV_APP_NAME,
    id: packaged ? APP_ID : DEV_APP_ID,
    homeDir,
    appDataDir: join(homeDir, LIBRARY_DIR_NAME, APP_DATA_DIR_NAME),
  };
}
