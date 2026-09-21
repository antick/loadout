import { APP_NAME, type LanguageSetting } from "@loadout/shared";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";

export const FALLBACK_LANGUAGE: LanguageSetting = "en";

/** Languages the UI ships. To add one: drop `<code>.json` in `locales/`, add it here and below. */
export const LANGUAGES: readonly { code: LanguageSetting; label: string }[] = [
  { code: "en", label: "English" },
];

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
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  // `{{app}}` is available in every string, so the product name is never typed into copy.
  interpolation: { escapeValue: false, defaultVariables: { app: APP_NAME } },
  returnNull: false,
});

/** Switch the UI language, falling back to English for a language that has no bundle yet. */
export function applyLanguage(language: LanguageSetting): void {
  const supported = LANGUAGES.some((entry) => entry.code === language);
  const next = supported ? language : FALLBACK_LANGUAGE;
  if (i18n.language !== next) void i18n.changeLanguage(next);
  document.documentElement.lang = next;
}
