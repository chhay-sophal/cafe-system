import { ref } from "vue";
import { fetchExchangeRate as apiFetchExchangeRate } from "../lib/api";
import type { MainCurrency } from "../types/settings";

const RATE_STORAGE_KEY = "pos.exchangeRateRielPerUsd";
const CURRENCY_STORAGE_KEY = "pos.mainCurrency";
const TAX_ENABLED_STORAGE_KEY = "pos.taxEnabled";
// First-setup defaults, matching how Cambodian SME/family-run stores are
// typically set up out of the box (also the backend's own fallback in
// getStoreSettings) - used before the first real fetch resolves, or when
// there's no cache yet and the register is offline on first launch.
const DEFAULT_RATE = 4100;
const DEFAULT_CURRENCY: MainCurrency = "KHR";
const DEFAULT_TAX_ENABLED = false;

function loadCachedRate(): number {
  const raw = localStorage.getItem(RATE_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE;
}

function loadCachedCurrency(): MainCurrency {
  const raw = localStorage.getItem(CURRENCY_STORAGE_KEY);
  // Distinguish "cached as USD" from "no cache yet" - collapsing both to a
  // ternary against DEFAULT_CURRENCY would silently discard an actually
  // -cached USD preference now that the default itself is KHR.
  return raw === "USD" || raw === "KHR" ? raw : DEFAULT_CURRENCY;
}

function loadCachedTaxEnabled(): boolean {
  const raw = localStorage.getItem(TAX_ENABLED_STORAGE_KEY);
  return raw === null ? DEFAULT_TAX_ENABLED : raw === "true";
}

// POS is offline-first (see useOfflineQueue/useNetworkStatus) - these are
// cached locally so checkout/display still work, using the last known
// values, when the register can't reach the backend.
const exchangeRateRielPerUsd = ref(loadCachedRate());
const mainCurrency = ref<MainCurrency>(loadCachedCurrency());
const taxEnabled = ref(loadCachedTaxEnabled());

async function refreshExchangeRate(): Promise<void> {
  try {
    const result = await apiFetchExchangeRate();
    exchangeRateRielPerUsd.value = result.exchangeRateRielPerUsd;
    mainCurrency.value = result.mainCurrency;
    taxEnabled.value = result.taxEnabled;
    localStorage.setItem(RATE_STORAGE_KEY, String(result.exchangeRateRielPerUsd));
    localStorage.setItem(CURRENCY_STORAGE_KEY, result.mainCurrency);
    localStorage.setItem(TAX_ENABLED_STORAGE_KEY, String(result.taxEnabled));
  } catch {
    // Unreachable/offline - keep using the cached values.
  }
}

export function useExchangeRate() {
  return { exchangeRateRielPerUsd, mainCurrency, taxEnabled, refreshExchangeRate };
}
