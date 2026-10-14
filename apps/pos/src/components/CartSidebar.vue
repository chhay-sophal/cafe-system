<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useExchangeRate } from "../composables/useExchangeRate";
import { formatMain, formatSecondary } from "../lib/currency";
import type { CartLineItem } from "../types/cart";
import CartItemRow from "./CartItemRow.vue";

const { t } = useI18n({ useScope: "global" });

const props = defineProps<{
  items: CartLineItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
}>();

const emit = defineEmits<{
  increment: [cartItemId: string];
  decrement: [cartItemId: string];
  remove: [cartItemId: string];
  "update:discount": [amount: number];
  checkout: [];
}>();

const { exchangeRateRielPerUsd, mainCurrency, taxEnabled } = useExchangeRate();

function format(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function formatSecondaryEquivalent(value: number): string {
  return formatSecondary(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function handleDiscountInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  emit("update:discount", value);
}
</script>

<template>
  <aside class="cart-sidebar" :aria-label="t('cart.ariaLabel')">
    <header class="cart-sidebar__header">
      <h2>{{ t("cart.heading") }}</h2>
    </header>

    <div class="cart-sidebar__items">
      <p v-if="items.length === 0" class="cart-sidebar__empty">{{ t("cart.empty") }}</p>

      <CartItemRow
        v-for="item in items"
        :key="item.cartItemId"
        :item="item"
        @increment="emit('increment', item.cartItemId)"
        @decrement="emit('decrement', item.cartItemId)"
        @remove="emit('remove', item.cartItemId)"
      />
    </div>

    <footer class="cart-sidebar__summary">
      <div class="cart-sidebar__row">
        <span>{{ t("cart.subtotal") }}</span>
        <span>{{ format(props.subtotal) }}</span>
      </div>
      <div v-if="taxEnabled" class="cart-sidebar__row">
        <span>{{ t("cart.tax") }}</span>
        <span>{{ format(props.taxAmount) }}</span>
      </div>
      <div class="cart-sidebar__row cart-sidebar__row--discount">
        <label for="discount-input">{{ t("cart.discount") }}</label>
        <div class="cart-sidebar__discount-input">
          <span>-$</span>
          <input
            id="discount-input"
            type="number"
            min="0"
            step="0.01"
            :value="props.discountAmount"
            @input="handleDiscountInput"
          />
        </div>
      </div>
      <div class="cart-sidebar__row cart-sidebar__row--total">
        <span>{{ t("cart.total") }}</span>
        <span>
          {{ format(props.totalAmount) }}
          <span class="cart-sidebar__total-secondary">{{ formatSecondaryEquivalent(props.totalAmount) }}</span>
        </span>
      </div>

      <button
        type="button"
        class="cart-sidebar__checkout"
        :disabled="items.length === 0"
        @click="emit('checkout')"
      >
        {{ t("cart.checkout") }}
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.cart-sidebar {
  display: flex;
  flex-direction: column;
  width: 360px;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  background: #f9f9f9;
  border-left: 2px solid var(--border-color, #e2e2e2);
}

.cart-sidebar__header {
  flex-shrink: 0;
  padding: 1rem 1.25rem;
  background: var(--color-primary);
  color: #ffffff;
}

.cart-sidebar__header h2 {
  margin: 0;
  font-size: 1.05rem;
}

.cart-sidebar__items {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cart-sidebar__empty {
  text-align: center;
  color: #888888;
  padding: 2rem 0.5rem;
  font-size: 0.95rem;
}

.cart-sidebar__summary {
  flex-shrink: 0;
  padding: 1rem 1.25rem 1.25rem;
  border-top: 2px solid var(--border-color, #e2e2e2);
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.cart-sidebar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.95rem;
  color: #444444;
}

.cart-sidebar__row--discount label {
  color: #444444;
}

.cart-sidebar__discount-input {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.cart-sidebar__discount-input input {
  width: 70px;
  min-height: 36px;
  border: 2px solid #dcdcdc;
  border-radius: 8px;
  padding: 0.25rem 0.5rem;
  font-size: 0.95rem;
  text-align: right;
}

.cart-sidebar__row--total {
  margin-top: 0.35rem;
  padding-top: 0.6rem;
  border-top: 1px dashed #dcdcdc;
  font-size: 1.2rem;
  font-weight: 700;
  color: #1a1a1a;
  align-items: baseline;
}

.cart-sidebar__total-secondary {
  margin-left: 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #999999;
}

.cart-sidebar__checkout {
  margin-top: 0.5rem;
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

.cart-sidebar__checkout:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .cart-sidebar {
    width: 300px;
  }
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity, so they override light styles
   exactly as the prefers-color-scheme media query used to. */
:where(:root[data-theme="dark"]) .cart-sidebar {
  background: #1c1c1c;
  border-left-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .cart-sidebar__summary {
  background: #242424;
  border-top-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .cart-sidebar__row {
  color: #dddddd;
}

:where(:root[data-theme="dark"]) .cart-sidebar__row--discount label {
  color: #dddddd;
}

:where(:root[data-theme="dark"]) .cart-sidebar__discount-input input {
  background: #2a2a2a;
  border-color: #444444;
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .cart-sidebar__row--total {
  color: #f2f2f2;
  border-top-color: #444444;
}

:where(:root[data-theme="dark"]) .cart-sidebar__total-secondary {
  color: #777777;
}

:where(:root[data-theme="dark"]) .cart-sidebar__checkout {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary);
}
</style>
