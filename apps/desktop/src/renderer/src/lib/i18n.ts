import { APP_NAME, REMOVED_KEEP_DAYS } from "@loadout/shared";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";

/** The UI ships in English only. */
const LANGUAGE = "en";

type Messages = Record<string, unknown>;

/**
 * Feature pages keep their strings in `locales/en/<feature>.json` (top-level keys are the feature's
 * own namespaces), so features never edit one shared file. They are merged over the base bundle.
 */
const featureBundles = import.meta.glob<Messages>("../locales/en/*.json", {
  eager: true,
  import: "default",
});

function mergeMessages(base: Messages, extra: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = merged[key];
    const bothObjects =
      typeof current === "object" &&
      current !== null &&
      typeof value === "object" &&
      value !== null;
    merged[key] = bothObjects ? mergeMessages(current as Messages, value as Messages) : value;
  }
  return merged;
}

const english = Object.values(featureBundles).reduce(mergeMessages, en as Messages);

const resources = { en: { translation: english } };

/** The app's i18next instance. Outside React use `i18n.t(key)`; inside use `useTranslation()`. */
export const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: LANGUAGE,
  fallbackLng: LANGUAGE,
  // `{{app}}` is available in every string, so the product name is never typed into copy.
  interpolation: {
    escapeValue: false,
    defaultVariables: { app: APP_NAME, removedDays: REMOVED_KEEP_DAYS },
  },
  returnNull: false,
});
