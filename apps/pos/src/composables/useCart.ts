import { computed, ref } from "vue";
import { useExchangeRate } from "./useExchangeRate";
import type { CartLineItem, CartModifier } from "../types/cart";
import type { Product } from "../types/catalog";

// Placeholder rate: the backend has no tax-rate configuration endpoint (only
// enable/disable, via useExchangeRate's taxEnabled), so the register
// computes it locally and submits the resulting amount with the order.
const TAX_RATE = 0.08;

function modifierKey(modifiers: CartModifier[]): string {
  return modifiers
    .map((modifier) => modifier.id)
    .sort()
    .join(",");
}

export function useCart() {
  const { taxEnabled } = useExchangeRate();

  const items = ref<CartLineItem[]>([]);
  const discountAmount = ref(0);

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => {
      const unitPrice = item.unitBasePrice + item.modifiers.reduce((m, mod) => m + mod.priceExtra, 0);
      return sum + unitPrice * item.quantity;
    }, 0),
  );

  const taxAmount = computed(() => (taxEnabled.value ? subtotal.value * TAX_RATE : 0));

  const clampedDiscount = computed(() => Math.min(Math.max(discountAmount.value, 0), subtotal.value));

  const totalAmount = computed(() => subtotal.value + taxAmount.value - clampedDiscount.value);

  function lineUnitPrice(item: CartLineItem): number {
    return item.unitBasePrice + item.modifiers.reduce((sum, mod) => sum + mod.priceExtra, 0);
  }

  function addItem(product: Product, modifiers: CartModifier[]) {
    const key = modifierKey(modifiers);
    const existingIndex = items.value.findIndex(
      (item) => item.productId === product.id && modifierKey(item.modifiers) === key,
    );

    if (existingIndex !== -1) {
      const [existing] = items.value.splice(existingIndex, 1);
      existing.quantity += 1;
      items.value.unshift(existing);
      return;
    }

    items.value.unshift({
      cartItemId: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      unitBasePrice: product.basePrice,
      modifiers,
      quantity: 1,
    });
  }

  function incrementQuantity(cartItemId: string) {
    const item = items.value.find((i) => i.cartItemId === cartItemId);
    if (item) {
      item.quantity += 1;
    }
  }

  function decrementQuantity(cartItemId: string) {
    const item = items.value.find((i) => i.cartItemId === cartItemId);
    if (!item) {
      return;
    }
    if (item.quantity <= 1) {
      removeItem(cartItemId);
      return;
    }
    item.quantity -= 1;
  }

  function removeItem(cartItemId: string) {
    items.value = items.value.filter((item) => item.cartItemId !== cartItemId);
  }

  function setDiscount(amount: number) {
    discountAmount.value = Number.isFinite(amount) ? amount : 0;
  }

  function reset() {
    items.value = [];
    discountAmount.value = 0;
  }

  return {
    items,
    subtotal,
    taxAmount,
    discountAmount: clampedDiscount,
    totalAmount,
    lineUnitPrice,
    addItem,
    incrementQuantity,
    decrementQuantity,
    removeItem,
    setDiscount,
    reset,
  };
}
