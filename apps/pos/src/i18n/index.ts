import { createI18n } from "vue-i18n";
import enUS from "./locales/en-US.json";
import kmKH from "./locales/km-KH.json";

const STORAGE_KEY = "pos.locale";

function loadStoredLocale(): "en-US" | "km-KH" {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "km-KH" ? "km-KH" : "en-US";
}

export const i18n = createI18n({
  legacy: false,
  locale: loadStoredLocale(),
  fallbackLocale: "en-US",
  messages: {
    "en-US": enUS,
    "km-KH": kmKH,
  },
});

// Composables invoked outside a component's setup (store-like singletons,
// event handlers called well after mount) can't call useI18n() - Vue's
// inject() requires an active component instance. The global composer on
// this instance has no such restriction, so lib code reaches for this.
export const t = i18n.global.t;

export function setLocale(locale: "en-US" | "km-KH") {
  i18n.global.locale.value = locale;
  localStorage.setItem(STORAGE_KEY, locale);
}
