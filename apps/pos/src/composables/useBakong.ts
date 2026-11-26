import { computed, ref } from "vue";
import { notifyPosSettingChanged } from "../lib/settingsEvents";

const STORAGE_KEY = "pos.bakong";

// The store's Bakong account, for Mobile Pay QRs with the exact amount
// (KHQR, see CheckoutModal). Store-wide, shared with the server and IMS
// (usePosSettingsSync), and kept here so Settings shows it offline. An empty
// account id means KHQR is off - checkout shows only the bank QR images.
export interface BakongAccount {
  accountId: string;
  merchantName: string;
  merchantCity: string;
}

const DEFAULT_ACCOUNT: BakongAccount = { accountId: "", merchantName: "", merchantCity: "Phnom Penh" };

function normalize(value: unknown): BakongAccount {
  const raw = (value ?? {}) as Partial<Record<keyof BakongAccount, unknown>>;
  const text = (input: unknown, fallback: string) => (typeof input === "string" ? input.trim() : fallback);
  return {
    accountId: text(raw.accountId, DEFAULT_ACCOUNT.accountId),
    merchantName: text(raw.merchantName, DEFAULT_ACCOUNT.merchantName),
    merchantCity: text(raw.merchantCity, DEFAULT_ACCOUNT.merchantCity),
  };
}

function load(): BakongAccount {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_ACCOUNT };
  }
}

const account = ref<BakongAccount>(load());
const isEnabled = computed(() => account.value.accountId !== "");

function store(next: BakongAccount) {
  account.value = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function setAccount(next: BakongAccount) {
  store(normalize(next));
  notifyPosSettingChanged("bakong");
}

// The shared setting as the server has it.
function applyFromServer(value: unknown) {
  store(normalize(value));
}

export function useBakong() {
  return { account, isEnabled, setAccount, applyFromServer };
}
