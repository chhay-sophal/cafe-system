import { defineStore } from "pinia";
import type { MainCurrency } from "~/types/settings";

// First-setup defaults, matching how Cambodian SME/family-run stores are
// typically set up out of the box - used before fetchExchangeRate()
// resolves for the first time.
const DEFAULT_EXCHANGE_RATE_RIEL_PER_USD = 4100;
const DEFAULT_MAIN_CURRENCY: MainCurrency = "KHR";
const DEFAULT_TAX_ENABLED = false;

interface SettingsState {
  exchangeRateRielPerUsd: number;
  mainCurrency: MainCurrency;
  taxEnabled: boolean;
  loadedAt: number | null;
  isLoading: boolean;
  error: string | null;
}

let inFlightLoad: Promise<void> | null = null;

export const useSettingsStore = defineStore("settings", {
  state: (): SettingsState => ({
    exchangeRateRielPerUsd: DEFAULT_EXCHANGE_RATE_RIEL_PER_USD,
    mainCurrency: DEFAULT_MAIN_CURRENCY,
    taxEnabled: DEFAULT_TAX_ENABLED,
    loadedAt: null,
    isLoading: false,
    error: null,
  }),

  actions: {
    // A load already in progress is shared rather than repeated - the app loads
    // these at login, and the Settings page asks for them at the same moment
    // when it's the page that opens.
    fetchExchangeRate(): Promise<void> {
      inFlightLoad ??= (async () => {
        const { fetchExchangeRate } = useApi();
        this.isLoading = true;
        this.error = null;

        try {
          const result = await fetchExchangeRate();
          this.exchangeRateRielPerUsd = result.exchangeRateRielPerUsd;
          this.mainCurrency = result.mainCurrency;
          this.taxEnabled = result.taxEnabled;
          this.loadedAt = Date.now();
        } catch (error) {
          this.error = error instanceof Error ? error.message : "Failed to load exchange rate.";
        } finally {
          this.isLoading = false;
          inFlightLoad = null;
        }
      })();
      return inFlightLoad;
    },

    // Loaded at login; only changed here (Settings), so reused after that.
    async ensureLoaded() {
      if (!isFresh(this.loadedAt)) {
        await this.fetchExchangeRate();
      }
    },

    async updateExchangeRate(rate: number, token: string) {
      const { updateExchangeRate } = useApi();
      const result = await updateExchangeRate({ exchangeRateRielPerUsd: rate }, token);
      this.exchangeRateRielPerUsd = result.exchangeRateRielPerUsd;
    },

    async updateMainCurrency(currency: MainCurrency, token: string) {
      const { updateMainCurrency } = useApi();
      const result = await updateMainCurrency({ mainCurrency: currency }, token);
      this.mainCurrency = result.mainCurrency;
    },

    async updateTaxEnabled(enabled: boolean, token: string) {
      const { updateTaxSetting } = useApi();
      const result = await updateTaxSetting({ taxEnabled: enabled }, token);
      this.taxEnabled = result.taxEnabled;
    },
  },
});
