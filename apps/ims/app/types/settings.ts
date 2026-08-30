export type MainCurrency = "USD" | "KHR";

export interface ExchangeRateSetting {
  exchangeRateRielPerUsd: number;
}

export interface StoreSettings {
  exchangeRateRielPerUsd: number;
  mainCurrency: MainCurrency;
  taxEnabled: boolean;
}

export interface MainCurrencySetting {
  mainCurrency: MainCurrency;
}

export interface TaxSetting {
  taxEnabled: boolean;
}
