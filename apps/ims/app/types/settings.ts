export type MainCurrency = "USD" | "KHR";

export interface ExchangeRateSetting {
  exchangeRateRielPerUsd: number;
}

export interface StoreSettings {
  exchangeRateRielPerUsd: number;
  mainCurrency: MainCurrency;
}

export interface MainCurrencySetting {
  mainCurrency: MainCurrency;
}
