import { computed, ref } from "vue";
import { t } from "../i18n";

const STORAGE_KEY = "pos.storeName";

// Long enough for "Brand - Branch / Street" names, short enough to fit the
// header and a large-print receipt line without wrapping into a paragraph.
export const STORE_NAME_MAX_LENGTH = 60;

// Per register, like the printer and language: each branch's tills show that
// branch's name while sharing one backend. Empty = the default app title.
const customName = ref(localStorage.getItem(STORAGE_KEY) ?? "");

// What the header, login screen, customer display and receipts show. A custom
// name is used as typed in every language; the fallback follows the locale.
const storeName = computed(() => customName.value || t("app.title"));

// `persist: false` is for the customer display, which only mirrors the
// cashier window's choice - that window has already saved it.
function setStoreName(name: string, { persist = true } = {}) {
  const next = name.trim().slice(0, STORE_NAME_MAX_LENGTH);
  customName.value = next;
  if (!persist) {
    return;
  }
  if (next) {
    localStorage.setItem(STORAGE_KEY, next);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useStoreName() {
  return { customName, storeName, setStoreName };
}
