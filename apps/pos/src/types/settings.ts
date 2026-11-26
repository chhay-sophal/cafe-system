export type MainCurrency = "USD" | "KHR";

export interface StoreSettings {
  exchangeRateRielPerUsd: number;
  mainCurrency: MainCurrency;
  taxEnabled: boolean;
}

export type SocialPlatform = "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "TELEGRAM" | "WEBSITE" | "OTHER";

// Store-wide POS settings as the server keeps them (GET/PUT /api/settings/pos).
export interface PosSettings {
  storeName: string;
  storeDetails: {
    address: string;
    phones: string[];
    emails: string[];
    socials: Array<{ platform: SocialPlatform; handle: string }>;
  };
  paymentMethods: Array<"CASH" | "CARD" | "QR_CODE">;
  fastCash: { USD: number[]; KHR: number[] };
  khqrBanks: Array<{ id: string; name: string; imageUrl: string }>;
  language: "en-US" | "km-KH";
  hideUnavailableItems: boolean;
  bakong: { accountId: string; merchantName: string; merchantCity: string };
}

export interface PosSettingsResponse {
  // false until first saved - the register then uploads its own settings.
  configured: boolean;
  settings: PosSettings;
  // Sections never saved on the server - this register's value is uploaded
  // for those rather than the default in `settings` applied.
  unsetSections?: Array<keyof PosSettings>;
}
