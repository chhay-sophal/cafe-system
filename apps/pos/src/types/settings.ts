export type MainCurrency = "USD" | "KHR";

export interface StoreSettings {
  exchangeRateRielPerUsd: number;
  mainCurrency: MainCurrency;
  taxEnabled: boolean;
}
