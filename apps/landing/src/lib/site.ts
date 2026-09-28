import { INSTALL_GUIDE_URL, LATEST_RELEASE_URL, RELEASES_URL, SOURCE_URL } from "@loadout/shared";
import desktop from "../../../desktop/package.json";

/** Where the page lives, and the links it points at. One place to change them. */
export const SITE_URL = "https://loadout.potion.sh";
export const PARENT_URL = "https://potion.sh";
export const PARENT_NAME = "potion.sh";

/**
 * Where installers are published: the newest GitHub release. Empty would make the page say
 * installers are not published yet.
 */
export const DOWNLOADS_URL = LATEST_RELEASE_URL;
/** Every release, with its notes. */
export const ALL_RELEASES_URL = RELEASES_URL;
/** The source code. */
export const GITHUB_URL = SOURCE_URL;
/** Builds are not signed yet: the first launch needs one extra click, explained here. */
export const INSTALL_GUIDE = INSTALL_GUIDE_URL;

/** The app version the page describes: the desktop app's own version. */
export const APP_VERSION = desktop.version;
/** The product preview, also used when a link to the page is shared. */
export const LIBRARY_FIGURE = {
  src: "/figures/library.jpg",
  width: 1600,
  height: 1042,
  alt: "Loadout's skill library, with search, tags, and skill cards showing which agents use each skill.",
};

export const THEME_COLOR = "#fafaf7";
