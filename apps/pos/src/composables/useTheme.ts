import { ref } from "vue";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "pos.theme";

// The OS setting, consulted only while the preference is "system".
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function loadPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

// Per register, like the language and printer: each till's screen sits in
// its own lighting.
const preference = ref<ThemePreference>(loadPreference());

// Dark styles key off <html data-theme="dark"> (see the "Dark theme" rules in
// each component and styles/global.css) rather than the prefers-color-scheme
// media query, which only ever follows the OS. color-scheme keeps native
// bits - scrollbars, date pickers, select menus - matching the page.
function applyTheme() {
  const isDark = preference.value === "dark" || (preference.value === "system" && systemDark.matches);
  const root = document.documentElement;
  root.dataset.theme = isDark ? "dark" : "light";
  root.style.colorScheme = isDark ? "dark" : "light";
}

systemDark.addEventListener("change", applyTheme);

// Called once in main.ts before mounting, so neither window flashes the
// wrong theme on startup.
export function initTheme() {
  applyTheme();
}

// `persist: false` is for the customer display, which only mirrors the
// cashier window's choice - that window has already saved it.
function setPreference(next: ThemePreference, { persist = true } = {}) {
  preference.value = next;
  if (persist) {
    localStorage.setItem(STORAGE_KEY, next);
  }
  applyTheme();
}

export function useTheme() {
  return { preference, setPreference };
}
