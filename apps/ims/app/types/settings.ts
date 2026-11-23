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

export type PosPaymentMethod = "CASH" | "CARD" | "QR_CODE";
export type PosSocialPlatform = "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "TELEGRAM" | "WEBSITE" | "OTHER";

// Store-wide POS settings (GET/PUT /api/settings/pos), shared with the POS
// Settings tab - either side can change them.
export interface PosSettings {
  storeName: string;
  storeDetails: {
    address: string;
    phones: string[];
    emails: string[];
    socials: Array<{ platform: PosSocialPlatform; handle: string }>;
  };
  paymentMethods: PosPaymentMethod[];
  fastCash: { USD: number[]; KHR: number[] };
  khqrBanks: Array<{ id: string; name: string; imageUrl: string }>;
  language: "en-US" | "km-KH";
}

export interface PosSettingsResponse {
  // false until first saved (from here, or by the register uploading its own).
  configured: boolean;
  settings: PosSettings;
  // Never saved yet - the register keeps (and uploads) its own value.
  unsetSections: Array<keyof PosSettings>;
  updatedAt: string | null;
}
