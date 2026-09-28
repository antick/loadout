import type { ItemFormat } from "./item-targets";
import type { ItemWarning } from "./item-tools";
import type { ItemKind } from "./items";

/** Names one library item. */
export interface ItemRef {
  kind: ItemKind;
  name: string;
}

/** An agent's global folder (`projectId` null), or its folder inside a linked project. */
export interface ItemPlaceRef {
  agentKey: string;
  projectId: string | null;
}

/**
 * `in_sync`: the file is what the library item converts to. `outdated`: the library item changed
 * and the file will follow. `edited`: someone changed the file there, so Loadout leaves it alone.
 * `missing`: the file is gone.
 */
export type ItemDeploymentState = "in_sync" | "outdated" | "edited" | "missing";

export interface ItemDeployment extends ItemPlaceRef {
  path: string;
  state: ItemDeploymentState;
}

export interface LibraryItem extends ItemRef {
  description: string | null;
  /** SHA-256 of the text; send it back when saving. */
  hash: string;
  modifiedAt: number;
  deployments: ItemDeployment[];
}

export interface LibraryItemDetail extends LibraryItem {
  content: string;
  path: string;
}

/** An agent that reads this kind of item, and where. */
export interface ItemPlace {
  agentKey: string;
  agentName: string;
  installed: boolean;
  /** The agent's global folder for this kind; null when it reads this kind only in projects. */
  globalDir: string | null;
  /** Relative to a project's root; null when it reads this kind only globally. */
  projectDir: string | null;
  extension: string;
}

/** The file one agent gets for an item, before anything is written. */
export interface ItemPreview extends ItemPlaceRef {
  path: string;
  content: string;
  warnings: ItemWarning[];
  /** A file Loadout did not write is already there. */
  occupied: boolean;
}

export interface SaveItemInput {
  content: string;
  baseHash: string;
  /** Write even though the file changed on disk after `baseHash` was read. */
  overwrite?: boolean;
}

export interface DeployItemOptions {
  /**
   * Replace a file Loadout did not write. The old file is kept beside it with `.loadout-old`
   * added to its name, which no agent reads.
   */
  replace?: boolean;
}

export interface ItemRemovalResult {
  /** Files taken out of agent folders. */
  removed: string[];
  /** Files left in place because they were edited there. */
  kept: string[];
}

/** Where to look for items to import. */
export type ItemSource =
  | { type: "agents" }
  | { type: "folder"; path: string }
  | { type: "git"; url: string };

/**
 * `new`: no library item has the name. `same`: the library item has this content already.
 * `differs`: a library item with the name holds something else.
 */
export type FoundItemStatus = "new" | "same" | "differs";

/** An item file found in an agent's folder, a folder or a repository, in the library's format. */
export interface FoundItem extends ItemRef {
  /** Where it was found; inside a repository, relative to it. */
  path: string;
  format: ItemFormat;
  description: string | null;
  content: string;
  warnings: ItemWarning[];
  status: FoundItemStatus;
  /** The agent whose folder it is in, for items found in agent folders. */
  agentKey: string | null;
}

export interface ItemImportInput {
  kind: ItemKind;
  name: string;
  content: string;
}

export interface ItemImportResult {
  imported: ItemRef[];
  replaced: ItemRef[];
  /** Left out because the library already has an item of that name and `replace` was not set. */
  skipped: ItemRef[];
}
