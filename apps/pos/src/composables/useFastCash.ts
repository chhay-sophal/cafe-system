import { ref, type Ref } from "vue";
import { formatRiel } from "../lib/currency";

export type FastCashCurrency = "USD" | "KHR";

// Two rows of five in the checkout's tender column - more would push the
// other currency's buttons out of view on small screens.
export const FAST_CASH_MAX_BUTTONS = 10;

// Common notes, as checkout always offered before this was configurable.
const DEFAULT_AMOUNTS: Record<FastCashCurrency, number[]> = {
  USD: [0.01, 0.1, 1, 5, 10, 20, 50],
  KHR: [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
};

const STORAGE_KEYS: Record<FastCashCurrency, string> = {
  USD: "pos.fastCashUsd",
  KHR: "pos.fastCashRiel",
};

// Why an amount can't be added, for the settings screen to explain.
export type FastCashAddError = "invalid" | "duplicate" | "full";

// USD to the cent; riel in whole hundreds - the smallest note in circulation.
export function isValidFastCashAmount(currency: FastCashCurrency, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }
  if (currency === "KHR") {
    return amount % 100 === 0;
  }
  // Tolerance, not ===: 2.55 * 100 is 254.99999999999997 in floating point.
  return Math.abs(Math.round(amount * 100) - amount * 100) < 1e-6;
}

function normalize(currency: FastCashCurrency, amounts: unknown[]): number[] {
  const valid = amounts.filter(
    (amount): amount is number => typeof amount === "number" && isValidFastCashAmount(currency, amount),
  );
  return [...new Set(valid)].sort((a, b) => a - b).slice(0, FAST_CASH_MAX_BUTTONS);
}

function load(currency: FastCashCurrency): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS[currency]) ?? "null");
    if (Array.isArray(parsed)) {
      return normalize(currency, parsed);
    }
  } catch {
    // Unreadable value - fall back to the defaults.
  }
  return [...DEFAULT_AMOUNTS[currency]];
}

// Per register, like the payment methods: each till can match the notes its
// customers actually hand over. An empty list is allowed (no quick buttons).
const amounts: Record<FastCashCurrency, Ref<number[]>> = {
  USD: ref(load("USD")),
  KHR: ref(load("KHR")),
};

function save(currency: FastCashCurrency, next: number[]) {
  amounts[currency].value = next;
  localStorage.setItem(STORAGE_KEYS[currency], JSON.stringify(next));
}

function addAmount(currency: FastCashCurrency, amount: number): FastCashAddError | null {
  const current = amounts[currency].value;
  if (!isValidFastCashAmount(currency, amount)) {
    return "invalid";
  }
  if (current.includes(amount)) {
    return "duplicate";
  }
  if (current.length >= FAST_CASH_MAX_BUTTONS) {
    return "full";
  }
  save(currency, normalize(currency, [...current, amount]));
  return null;
}

function removeAmount(currency: FastCashCurrency, amount: number) {
  save(currency, amounts[currency].value.filter((existing) => existing !== amount));
}

function resetAmounts(currency: FastCashCurrency) {
  amounts[currency].value = [...DEFAULT_AMOUNTS[currency]];
  localStorage.removeItem(STORAGE_KEYS[currency]);
}

function isDefault(currency: FastCashCurrency): boolean {
  const current = amounts[currency].value;
  const defaults = DEFAULT_AMOUNTS[currency];
  return current.length === defaults.length && current.every((amount, index) => amount === defaults[index]);
}

// Button text, shared by checkout and the settings preview: "+$5", "+$0.50",
// "+5,000៛".
export function formatFastCashLabel(currency: FastCashCurrency, amount: number): string {
  if (currency === "KHR") {
    return `+${formatRiel(amount)}`;
  }
  return Number.isInteger(amount) ? `+$${amount}` : `+$${amount.toFixed(2)}`;
}

export function useFastCash() {
  return { amounts, addAmount, removeAmount, resetAmounts, isDefault };
}
