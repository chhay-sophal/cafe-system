import { ref } from "vue";
import type { PaymentMethod } from "../types/order";
import { notifyPosSettingChanged } from "../lib/settingsEvents";

const STORAGE_KEY = "pos.paymentMethods";

// Checkout lists enabled methods in this order, whatever order they were
// turned on in.
export const ALL_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "QR_CODE"];

function normalize(value: unknown): PaymentMethod[] {
  if (Array.isArray(value)) {
    const valid = ALL_PAYMENT_METHODS.filter((method) => value.includes(method));
    if (valid.length > 0) {
      return valid;
    }
  }
  return [...ALL_PAYMENT_METHODS];
}

function loadEnabled(): PaymentMethod[] {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    // Unreadable value - fall back to the default.
    return [...ALL_PAYMENT_METHODS];
  }
}

// Store-wide, shared with the server and IMS (usePosSettingsSync), and kept
// here too so checkout works offline. Defaults to every method.
const enabledMethods = ref<PaymentMethod[]>(loadEnabled());

function isEnabled(method: PaymentMethod): boolean {
  return enabledMethods.value.includes(method);
}

// Checkout needs something to take payment with, so the last enabled method
// can't be turned off.
function canToggle(method: PaymentMethod): boolean {
  return !isEnabled(method) || enabledMethods.value.length > 1;
}

function toggleMethod(method: PaymentMethod) {
  if (!canToggle(method)) {
    return;
  }
  const next = isEnabled(method)
    ? enabledMethods.value.filter((enabled) => enabled !== method)
    : ALL_PAYMENT_METHODS.filter((candidate) => candidate === method || isEnabled(candidate));
  enabledMethods.value = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notifyPosSettingChanged("paymentMethods");
}

// The shared setting as the server has it.
function applyFromServer(value: unknown) {
  const next = normalize(value);
  enabledMethods.value = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function usePaymentMethods() {
  return { enabledMethods, isEnabled, canToggle, toggleMethod, applyFromServer };
}
