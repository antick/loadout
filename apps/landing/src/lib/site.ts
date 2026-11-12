import desktop from "../../../desktop/package.json";

/** Where the page lives, and the links it points at. One place to change them. */
// Local-only by default. Set SITE_URL when intentionally hosting this app again.
export const SITE_URL = process.env.SITE_URL || "http://localhost:4321";
export const PARENT_URL = "https://potion.sh";
export const PARENT_NAME = "potion.sh";

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
