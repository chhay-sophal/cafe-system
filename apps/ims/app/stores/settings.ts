import { defineStore } from "pinia";
import type { MainCurrency } from "~/types/settings";

const DEFAULT_EXCHANGE_RATE_RIEL_PER_USD = 4100;
const DEFAULT_MAIN_CURRENCY: MainCurrency = "USD";
const DEFAULT_TAX_ENABLED = true;

interface SettingsState {
  exchangeRateRielPerUsd: number;
  mainCurrency: MainCurrency;
  taxEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useSettingsStore = defineStore("settings", {
  state: (): SettingsState => ({
    exchangeRateRielPerUsd: DEFAULT_EXCHANGE_RATE_RIEL_PER_USD,
    mainCurrency: DEFAULT_MAIN_CURRENCY,
    taxEnabled: DEFAULT_TAX_ENABLED,
    isLoading: false,
    error: null,
  }),

  actions: {
    async fetchExchangeRate() {
      const { fetchExchangeRate } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        const result = await fetchExchangeRate();
        this.exchangeRateRielPerUsd = result.exchangeRateRielPerUsd;
        this.mainCurrency = result.mainCurrency;
        this.taxEnabled = result.taxEnabled;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load exchange rate.";
      } finally {
        this.isLoading = false;
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
