import { LIBRARY_PLACE } from "@loadout/shared";
import { i18n } from "@/lib/i18n";

/** A place core names (`Library`, an agent, `project · agent`) in the app's words. */
export function placeText(place: string): string {
  return place === LIBRARY_PLACE ? i18n.t("nav.library") : place;
}
