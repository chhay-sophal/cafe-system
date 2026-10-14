import { ref } from "vue";
import type { PaymentMethod } from "../types/order";

const STORAGE_KEY = "pos.paymentMethods";

// Checkout lists enabled methods in this order, whatever order they were
// turned on in.
export const ALL_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "QR_CODE"];

function loadEnabled(): PaymentMethod[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(parsed)) {
      const valid = ALL_PAYMENT_METHODS.filter((method) => parsed.includes(method));
      if (valid.length > 0) {
        return valid;
      }
    }
  } catch {
    // Unreadable value - fall through to the default.
  }
  return [...ALL_PAYMENT_METHODS];
}

// Per register, like the printer and KHQR banks: e.g. a till without a card
// terminal hides Card. Defaults to every method, as checkout always offered.
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
}

export function usePaymentMethods() {
  return { enabledMethods, isEnabled, canToggle, toggleMethod };
}
