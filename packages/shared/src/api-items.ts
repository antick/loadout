import type { ItemKind } from "./items";
import type {
  DeployItemOptions,
  FoundItem,
  ItemImportInput,
  ItemImportResult,
  ItemPlace,
  ItemPlaceRef,
  ItemPreview,
  ItemRef,
  ItemRemovalResult,
  ItemSource,
  LibraryItem,
  LibraryItemDetail,
  SaveItemInput,
} from "./types-items";

/** Subagents, slash commands and rules: kept in the library, converted for each agent. */
export interface ItemsApi {
  list(kind?: ItemKind): Promise<LibraryItem[]>;
  get(ref: ItemRef): Promise<LibraryItemDetail>;
  /** A new item; without `content`, a starting template for its kind. */
  create(ref: ItemRef, content?: string): Promise<LibraryItem>;
  /** Throws CHANGED_ON_DISK when the file moved on since `baseHash`, unless `overwrite`. */
  save(ref: ItemRef, input: SaveItemInput): Promise<LibraryItem>;
  /** Takes it out of every agent folder too, except files edited there. */
  remove(ref: ItemRef): Promise<ItemRemovalResult>;
  /** Every agent that reads this kind of item. */
  places(kind: ItemKind): Promise<ItemPlace[]>;
  /** What an agent would get, converted, and what the conversion could not carry over. */
  preview(ref: ItemRef, place: ItemPlaceRef): Promise<ItemPreview>;
  /** Refused with TARGET_CONFLICT when a file Loadout did not write is there, unless `replace`. */
  deploy(ref: ItemRef, place: ItemPlaceRef, options?: DeployItemOptions): Promise<LibraryItem>;
  /** A file edited in the agent's folder is left there; Loadout stops managing it. */
  undeploy(ref: ItemRef, place: ItemPlaceRef): Promise<ItemRemovalResult>;
  /** Items in agents' folders, a folder or a Git repository, read into the library's format. */
  find(source: ItemSource): Promise<FoundItem[]>;
  /** An item of a name already in the library is skipped unless `replace`. */
  importItems(items: ItemImportInput[], options?: { replace?: boolean }): Promise<ItemImportResult>;
}
