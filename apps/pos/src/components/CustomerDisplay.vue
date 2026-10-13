<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  onCartUpdate,
  onLocaleChange,
  onPaymentQr,
  onSaleCompleted,
  requestSync,
  type CartUpdatePayload,
  type PaymentQrPayload,
  type SaleCompletedPayload,
} from "../composables/useCustomerDisplayChannel";
import { useExchangeRate } from "../composables/useExchangeRate";
import { formatMain, formatRiel, formatSecondary, formatUsd } from "../lib/currency";

type Mode = "idle" | "building" | "completed";

const { t, locale } = useI18n({ useScope: "global" });
const { exchangeRateRielPerUsd, mainCurrency, refreshExchangeRate } = useExchangeRate();

const mode = ref<Mode>("idle");
const cartSnapshot = ref<CartUpdatePayload | null>(null);
const completedSnapshot = ref<SaleCompletedPayload | null>(null);
const paymentQr = ref<PaymentQrPayload | null>(null);

let unlistenCartUpdate: (() => void) | undefined;
let unlistenSaleCompleted: (() => void) | undefined;
let unlistenLocaleChange: (() => void) | undefined;
let unlistenPaymentQr: (() => void) | undefined;

function handleCartUpdate(payload: CartUpdatePayload) {
  if (payload.items.length === 0) {
    // The cart is only reset once the cashier dismisses the checkout
    // success screen (App.vue's handleCheckoutDone, on the "Done" button) -
    // so this is exactly the signal that the completed sale is done being
    // shown, not something to race against.
    mode.value = "idle";
    cartSnapshot.value = null;
    completedSnapshot.value = null;
    paymentQr.value = null;
    return;
  }

  mode.value = "building";
  cartSnapshot.value = payload;
}

function handleSaleCompleted(payload: SaleCompletedPayload) {
  completedSnapshot.value = payload;
  mode.value = "completed";
}

const activeOrder = computed(() => (mode.value === "completed" ? completedSnapshot.value : cartSnapshot.value));

function formatMainAmount(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function formatSecondaryAmount(value: number): string {
  return formatSecondary(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function formatTenderOrChange(usd: number, riel: number): string {
  if (usd > 0 && riel > 0) {
    return `${formatUsd(usd)} + ${formatRiel(riel)}`;
  }
  if (riel > 0) {
    return formatRiel(riel);
  }
  return formatUsd(usd);
}

onMounted(async () => {
  refreshExchangeRate();
  unlistenCartUpdate = await onCartUpdate(handleCartUpdate);
  unlistenSaleCompleted = await onSaleCompleted(handleSaleCompleted);
  // Only switches the in-memory locale - the cashier window already saved
  // the choice to the shared localStorage.
  unlistenLocaleChange = await onLocaleChange((newLocale) => {
    locale.value = newLocale;
  });
  unlistenPaymentQr = await onPaymentQr((payload) => {
    paymentQr.value = payload;
  });
  // Catches up a freshly (re)opened window to whatever the cashier's
  // cart already holds, instead of starting blank.
  requestSync();
});

onUnmounted(() => {
  unlistenCartUpdate?.();
  unlistenSaleCompleted?.();
  unlistenLocaleChange?.();
  unlistenPaymentQr?.();
});
</script>

<template>
  <div class="display">
    <header class="display__header">
      <h1>{{ t("app.title") }}</h1>
    </header>

    <div v-if="mode === 'idle'" class="idle">
      <svg class="idle__icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path
          d="M14 24h30v16a12 12 0 0 1-12 12H26a12 12 0 0 1-12-12V24Z"
          stroke="currentColor"
          stroke-width="3"
          stroke-linejoin="round"
        />
        <path
          d="M44 28h4a7 7 0 0 1 0 14h-4"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path d="M22 18c-1.5-2 1.5-4 0-7" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        <path d="M30 18c-1.5-2 1.5-4 0-7" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
      <p class="idle__title">{{ t("customerDisplay.idleTitle") }}</p>
    </div>

    <div v-else-if="activeOrder" class="order">
      <div class="order__main">
        <table class="order__table">
          <thead>
            <tr>
              <th class="order__col-no">{{ t("customerDisplay.columns.no") }}</th>
              <th>{{ t("customerDisplay.columns.item") }}</th>
              <th class="order__col-number">{{ t("customerDisplay.columns.price") }}</th>
              <th class="order__col-number">{{ t("customerDisplay.columns.amount") }}</th>
              <th class="order__col-number">{{ t("customerDisplay.columns.total") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in activeOrder.items" :key="item.cartItemId">
              <td class="order__col-no">{{ index + 1 }}</td>
              <td>
                <span class="order__item-name">{{ item.productName }}</span>
                <ul v-if="item.modifierNames.length > 0" class="order__modifiers">
                  <li v-for="name in item.modifierNames" :key="name">{{ name }}</li>
                </ul>
              </td>
              <td class="order__col-number">{{ formatMainAmount(item.unitPrice) }}</td>
              <td class="order__col-number">{{ item.quantity }}</td>
              <td class="order__col-number">{{ formatMainAmount(item.lineTotal) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="order__summary">
          <div v-if="activeOrder.discountAmount > 0" class="order__summary-row">
            <span>{{ t("customerDisplay.columns.discount") }}</span>
            <span>-{{ formatMainAmount(activeOrder.discountAmount) }}</span>
          </div>

          <div class="order__summary-row order__summary-row--total">
            <span>{{ t("customerDisplay.columns.grandTotal") }}</span>
            <span>
              {{ formatMainAmount(activeOrder.totalAmount) }}
              <span class="order__summary-secondary">{{ formatSecondaryAmount(activeOrder.totalAmount) }}</span>
            </span>
          </div>

          <template v-if="mode === 'completed' && completedSnapshot">
            <div v-if="completedSnapshot.paymentMethod === 'CASH'" class="order__summary-row">
              <span>{{ t("customerDisplay.columns.tender") }}</span>
              <span>{{ formatTenderOrChange(completedSnapshot.amountTenderedUsd, completedSnapshot.amountTenderedRiel) }}</span>
            </div>
            <div v-if="completedSnapshot.paymentMethod === 'CASH'" class="order__summary-row">
              <span>{{ t("customerDisplay.columns.change") }}</span>
              <span>{{ formatTenderOrChange(completedSnapshot.changeGivenUsd, completedSnapshot.changeGivenRiel) }}</span>
            </div>
            <div v-else class="order__summary-row">
              <span>{{ t("customerDisplay.columns.paymentMethod") }}</span>
              <span>{{ t(`checkout.methods.${completedSnapshot.paymentMethod}`) }}</span>
            </div>
          </template>
        </div>
      </div>

      <aside v-if="paymentQr && mode !== 'completed'" class="qr-panel">
        <p class="qr-panel__title">{{ t("customerDisplay.scanToPay") }}</p>
        <img :src="paymentQr.qrImage" :alt="paymentQr.bankName" class="qr-panel__image" />
        <p class="qr-panel__bank">{{ paymentQr.bankName }}</p>
        <p class="qr-panel__amount">
          {{ formatMainAmount(activeOrder.totalAmount) }}
          <span class="qr-panel__amount-secondary">{{ formatSecondaryAmount(activeOrder.totalAmount) }}</span>
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.display {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.display__header {
  flex-shrink: 0;
  padding: 1.5rem 2rem;
  background: #111111;
  color: #ffffff;
}

.display__header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
}

.idle {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  color: #999999;
}

.idle__icon {
  width: 220px;
  height: 220px;
}

.idle__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 600;
}

.order {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 2rem;
  padding: 2rem;
}

.order__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.qr-panel {
  flex-shrink: 0;
  width: 380px;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  border-radius: 20px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
}

.qr-panel__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: #111111;
}

/* Kept on a white card in both themes - scanners need dark-on-light. Banks'
   KHQR images are often a branded card rather than a bare square, so the
   image keeps its own proportions. */
.qr-panel__image {
  width: 100%;
  max-height: 55vh;
  object-fit: contain;
  background: #ffffff;
}

.qr-panel__bank {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #444444;
}

.qr-panel__amount {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 2rem;
  font-weight: 800;
  color: #111111;
}

.qr-panel__amount-secondary {
  font-size: 1rem;
  font-weight: 600;
  color: #999999;
}

.order__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 1.35rem;
}

.order__table th {
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 2px solid #dcdcdc;
  color: #666666;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.order__table td {
  padding: 1rem;
  border-bottom: 1px solid #eaeaea;
  vertical-align: top;
}

.order__col-no {
  width: 3rem;
}

.order__col-number {
  text-align: right;
  white-space: nowrap;
}

.order__item-name {
  font-weight: 700;
  color: #1a1a1a;
}

.order__modifiers {
  margin: 0.25rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 1rem;
  color: #777777;
}

.order__summary {
  align-self: flex-end;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 1.35rem;
}

.order__summary-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: #444444;
}

.order__summary-row--total {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 2px dashed #dcdcdc;
  font-size: 1.9rem;
  font-weight: 800;
  color: #111111;
}

.order__summary-secondary {
  margin-left: 0.4rem;
  font-size: 1rem;
  font-weight: 600;
  color: #999999;
}

@media (prefers-color-scheme: dark) {
  .order__table th {
    color: #aaaaaa;
    border-bottom-color: #3a3a3a;
  }

  .order__table td {
    border-bottom-color: #2a2a2a;
  }

  .order__item-name {
    color: #f2f2f2;
  }

  .order__modifiers {
    color: #999999;
  }

  .order__summary-row {
    color: #cccccc;
  }

  .order__summary-row--total {
    color: #ffffff;
    border-top-color: #444444;
  }

  .order__summary-secondary {
    color: #888888;
  }
}
</style>
