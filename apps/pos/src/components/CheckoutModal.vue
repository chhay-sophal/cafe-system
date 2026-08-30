<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { HttpError, submitOrder } from "../lib/api";
import { computeChange, formatMain, formatRiel, formatSecondary, formatUsd, round2 } from "../lib/currency";
import { useExchangeRate } from "../composables/useExchangeRate";
import { publishSaleCompleted } from "../composables/useCustomerDisplayChannel";
import { useNetworkStatus } from "../composables/useNetworkStatus";
import { useOfflineQueue } from "../composables/useOfflineQueue";
import type { CartLineItem } from "../types/cart";
import type { OrderPayload, OrderResult, PaymentMethod } from "../types/order";

const props = defineProps<{
  items: CartLineItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  token: string;
}>();

const emit = defineEmits<{
  cancel: [];
  done: [];
}>();

type Phase = "payment" | "submitting" | "success" | "error";

const { t } = useI18n({ useScope: "global" });

const PAYMENT_METHODS = computed<Array<{ value: PaymentMethod; label: string }>>(() => [
  { value: "CASH", label: t("checkout.methods.CASH") },
  { value: "CARD", label: t("checkout.methods.CARD") },
  { value: "QR_CODE", label: t("checkout.methods.QR_CODE") },
]);

const FAST_CASH_USD_AMOUNTS = [1, 5, 10, 20, 50];
const FAST_CASH_RIEL_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

const network = useNetworkStatus();
const offlineQueue = useOfflineQueue();
const { exchangeRateRielPerUsd, mainCurrency } = useExchangeRate();

const phase = ref<Phase>("payment");
const paymentMethod = ref<PaymentMethod>("CASH");
const amountTenderedUsd = ref(0);
const amountTenderedRiel = ref(0);
const errorMessage = ref<string | null>(null);
const orderResult = ref<OrderResult | null>(null);
const isQueuedOffline = ref(false);

const isCash = computed(() => paymentMethod.value === "CASH");

// The Riel leg is converted back to USD via the live exchange rate so
// tendering can mix both currencies (e.g. $3 + 2,000 riel) against a
// USD-denominated total.
const tenderedTotalUsd = computed(() => amountTenderedUsd.value + amountTenderedRiel.value / exchangeRateRielPerUsd.value);

const changeDueUsd = computed(() => Math.max(0, round2(tenderedTotalUsd.value - props.totalAmount)));
// Pure-USD tender gets USD notes + a Riel remainder; pure-Riel or mixed
// tender gets change entirely in Riel. Mirrors the backend's authoritative
// rule (POST /api/orders) for the optimistic/offline display.
const changeSplit = computed(() =>
  computeChange(changeDueUsd.value, exchangeRateRielPerUsd.value, amountTenderedUsd.value, amountTenderedRiel.value),
);

const amountShort = computed(() => Math.max(0, round2(props.totalAmount - tenderedTotalUsd.value)));
const isInsufficient = computed(() => isCash.value && round2(tenderedTotalUsd.value) < round2(props.totalAmount));
const canComplete = computed(() => !isInsufficient.value);

const successLabel = computed(() => {
  if (isQueuedOffline.value) {
    return t("checkout.orderQueued");
  }
  return isCash.value ? t("checkout.changeDueLabel") : t("checkout.paymentComplete");
});

// Offline orders have no server-confirmed change/total yet, so fall back to
// the client-side calculation until the sync engine reconciles them.
const successDisplay = computed(() => {
  if (isCash.value) {
    const split = isQueuedOffline.value || !orderResult.value
      ? changeSplit.value
      : { usd: orderResult.value.changeGivenUsd, riel: orderResult.value.changeGivenRiel };
    return formatChangeAmount(split.usd, split.riel);
  }
  const total = isQueuedOffline.value ? props.totalAmount : orderResult.value?.totalAmount ?? props.totalAmount;
  return format(total);
});

function format(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function formatSecondaryAmount(value: number): string {
  return formatSecondary(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

// USD/Riel tender order follows the main-currency setting so the more
// prominent currency's input and fast-cash row appear first.
const isMainKhr = computed(() => mainCurrency.value === "KHR");

function formatChangeAmount(usd: number, riel: number): string {
  if (usd > 0 && riel > 0) {
    return `${formatUsd(usd)} + ${formatRiel(riel)}`;
  }
  if (riel > 0) {
    return formatRiel(riel);
  }
  return formatUsd(usd);
}

function selectPaymentMethod(method: PaymentMethod) {
  paymentMethod.value = method;
  amountTenderedUsd.value = method === "CASH" ? 0 : props.totalAmount;
  amountTenderedRiel.value = 0;
}

function addFastCashUsd(amount: number) {
  amountTenderedUsd.value = round2(amountTenderedUsd.value + amount);
}

function addFastCashRiel(amount: number) {
  amountTenderedRiel.value = amountTenderedRiel.value + amount;
}

function setExactChange() {
  amountTenderedUsd.value = props.totalAmount;
  amountTenderedRiel.value = 0;
}

function clearTendered() {
  amountTenderedUsd.value = 0;
  amountTenderedRiel.value = 0;
}

function handleTenderedUsdInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  amountTenderedUsd.value = Number.isFinite(value) && value >= 0 ? value : 0;
}

function handleTenderedRielInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  amountTenderedRiel.value = Number.isFinite(value) && value >= 0 ? value : 0;
}

function buildOrderPayload(): OrderPayload {
  return {
    items: props.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitBasePrice,
      selectedModifiers: item.modifiers,
    })),
    paymentMethod: paymentMethod.value,
    amountTenderedUsd: amountTenderedUsd.value,
    amountTenderedRiel: amountTenderedRiel.value,
    taxAmount: props.taxAmount,
    discountAmount: props.discountAmount,
  };
}

async function queueOffline(payload: OrderPayload) {
  try {
    await offlineQueue.enqueue(payload);
    orderResult.value = null;
    isQueuedOffline.value = true;
    phase.value = "success";
  } catch (error) {
    // Even local persistence can fail (e.g. IndexedDB unavailable/full) - the
    // cashier still needs to know the sale did not go through anywhere.
    errorMessage.value = error instanceof Error ? error.message : t("checkout.saveLocalError");
    phase.value = "error";
  }
}

async function handleComplete() {
  if (!canComplete.value || phase.value === "submitting") {
    return;
  }

  phase.value = "submitting";
  errorMessage.value = null;
  const payload = buildOrderPayload();

  // Already known offline - skip the network round trip entirely so the
  // cashier never sits staring at a spinner waiting for a doomed request.
  if (!network.isOnline.value) {
    await queueOffline(payload);
    return;
  }

  try {
    const result = await submitOrder(payload, props.token);
    orderResult.value = result;
    isQueuedOffline.value = false;
    phase.value = "success";
  } catch (error) {
    if (error instanceof HttpError) {
      // Server was reached and rejected the request - a real error, not a
      // connectivity problem, so surface it instead of silently queueing.
      errorMessage.value = error.message;
      phase.value = "error";
      return;
    }

    // navigator.onLine said we were connected but the request still failed
    // outright (unreachable host, timed out) - treat it the same as offline.
    await queueOffline(payload);
  }
}

// Publishes the finished sale to the customer-facing display once, at the
// exact moment the sale actually succeeds (online or queued offline) -
// matches successDisplay's own preference for the server-confirmed change
// amounts over the locally-computed ones when both are available.
watch(phase, (newPhase) => {
  if (newPhase !== "success") {
    return;
  }

  const change = isQueuedOffline.value || !orderResult.value
    ? changeSplit.value
    : { usd: orderResult.value.changeGivenUsd, riel: orderResult.value.changeGivenRiel };

  publishSaleCompleted({
    items: props.items.map((item) => {
      const unitPrice = item.unitBasePrice + item.modifiers.reduce((sum, modifier) => sum + modifier.priceExtra, 0);
      return {
        cartItemId: item.cartItemId,
        productName: item.productName,
        modifierNames: item.modifiers.map((modifier) => modifier.name),
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      };
    }),
    discountAmount: props.discountAmount,
    totalAmount: props.totalAmount,
    paymentMethod: paymentMethod.value,
    amountTenderedUsd: amountTenderedUsd.value,
    amountTenderedRiel: amountTenderedRiel.value,
    changeGivenUsd: change.usd,
    changeGivenRiel: change.riel,
  });
});

function handleCancel() {
  emit("cancel");
}

function handleRetry() {
  phase.value = "payment";
}

function handleDone() {
  emit("done");
}
</script>

<template>
  <div class="checkout-backdrop">
    <div class="checkout-modal" role="dialog" aria-modal="true" :aria-label="t('checkout.dialogAriaLabel')">
      <header class="checkout-modal__header">
        <h2>{{ t("checkout.heading") }}</h2>
        <button
          v-if="phase === 'payment' || phase === 'error'"
          type="button"
          class="checkout-modal__close"
          :aria-label="t('common.close')"
          @click="handleCancel"
        >
          &times;
        </button>
      </header>

      <div v-if="phase === 'payment'" class="checkout-modal__body">
        <div class="checkout-total">
          <span>{{ t("checkout.totalDue") }}</span>
          <span class="checkout-total__amount">
            {{ format(totalAmount) }}
            <span class="checkout-total__amount-secondary">{{ formatSecondaryAmount(totalAmount) }}</span>
          </span>
        </div>

        <div class="payment-methods">
          <button
            v-for="method in PAYMENT_METHODS"
            :key="method.value"
            type="button"
            class="payment-method"
            :class="{ 'payment-method--active': paymentMethod === method.value }"
            @click="selectPaymentMethod(method.value)"
          >
            {{ method.label }}
          </button>
        </div>

        <template v-if="isCash">
          <div class="tender-sections">
            <div class="tender-section" :style="{ order: isMainKhr ? 2 : 1 }">
              <div class="tendered-display">
                <span class="tendered-display__label">{{ t("checkout.amountTenderedUsd") }}</span>
                <div class="tendered-display__input-wrap">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    :value="amountTenderedUsd"
                    @input="handleTenderedUsdInput"
                  />
                </div>
              </div>

              <div class="fast-cash">
                <button
                  v-for="amount in FAST_CASH_USD_AMOUNTS"
                  :key="amount"
                  type="button"
                  class="fast-cash__button"
                  @click="addFastCashUsd(amount)"
                >
                  +${{ amount }}
                </button>
                <button type="button" class="fast-cash__button fast-cash__button--exact" @click="setExactChange">
                  {{ t("checkout.exactChange") }}
                </button>
              </div>
            </div>

            <div class="tender-section" :style="{ order: isMainKhr ? 1 : 2 }">
              <div class="tendered-display">
                <span class="tendered-display__label">{{ t("checkout.amountTenderedRiel") }}</span>
                <div class="tendered-display__input-wrap">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    :value="amountTenderedRiel"
                    @input="handleTenderedRielInput"
                  />
                  <span>៛</span>
                </div>
              </div>

              <div class="fast-cash">
                <button
                  v-for="amount in FAST_CASH_RIEL_AMOUNTS"
                  :key="amount"
                  type="button"
                  class="fast-cash__button"
                  @click="addFastCashRiel(amount)"
                >
                  +{{ amount.toLocaleString() }}៛
                </button>
              </div>
            </div>
          </div>

          <button type="button" class="tendered-clear" @click="clearTendered">{{ t("common.clear") }}</button>

          <div class="change-banner" :class="{ 'change-banner--warning': isInsufficient }">
            <span v-if="isInsufficient">{{ t("checkout.amountShort", { amount: format(amountShort) }) }}</span>
            <span v-else>{{ t("checkout.changeDue", { amount: formatChangeAmount(changeSplit.usd, changeSplit.riel) }) }}</span>
          </div>
        </template>

        <button type="button" class="checkout-modal__complete" :disabled="!canComplete" @click="handleComplete">
          {{ t("checkout.completePayment") }}
        </button>
      </div>

      <div v-else-if="phase === 'submitting'" class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-modal__status">{{ t("checkout.processing") }}</p>
      </div>

      <div v-else-if="phase === 'success'" class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-success__label">{{ successLabel }}</p>
        <p class="checkout-success__amount">{{ successDisplay }}</p>
        <p v-if="isQueuedOffline" class="checkout-success__order">{{ t("checkout.savedOffline") }}</p>
        <p v-else class="checkout-success__order">{{ t("checkout.orderNumber", { number: orderResult?.orderNumber }) }}</p>
        <button type="button" class="checkout-modal__complete" @click="handleDone">{{ t("common.done") }}</button>
      </div>

      <div v-else class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-modal__error">{{ errorMessage }}</p>
        <div class="checkout-error__actions">
          <button type="button" class="checkout-modal__cancel" @click="handleCancel">{{ t("common.cancel") }}</button>
          <button type="button" class="checkout-modal__complete" @click="handleRetry">{{ t("common.tryAgain") }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkout-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.checkout-modal {
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.checkout-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #111111;
  color: #ffffff;
}

.checkout-modal__header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.checkout-modal__close {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.checkout-modal__body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.checkout-modal__body--centered {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 1.5rem;
  min-height: 260px;
}

.checkout-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: #f4f4f4;
}

.checkout-total__amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111111;
}

.checkout-total__amount-secondary {
  margin-left: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #999999;
}

.payment-methods {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.payment-method {
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  color: #1a1a1a;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 0.1s ease, background-color 0.15s ease, border-color 0.15s ease;
}

.payment-method:active {
  transform: scale(0.96);
}

.payment-method--active {
  background: #111111;
  border-color: #111111;
  color: #ffffff;
}

.tender-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tender-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tendered-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tendered-display__label {
  font-weight: 600;
  color: #444444;
}

.tendered-display__input-wrap {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 1.2rem;
  font-weight: 700;
}

.tendered-display__input-wrap input {
  width: 120px;
  min-height: 44px;
  border: 2px solid #dcdcdc;
  border-radius: 10px;
  padding: 0.25rem 0.6rem;
  font-size: 1.2rem;
  font-weight: 700;
  text-align: right;
}

.fast-cash {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.fast-cash__button {
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  color: #1a1a1a;
  cursor: pointer;
  touch-action: manipulation;
}

.fast-cash__button:active {
  transform: scale(0.96);
}

.fast-cash__button--exact {
  font-size: 0.8rem;
}

.tendered-clear {
  align-self: flex-end;
  border: none;
  background: transparent;
  color: #888888;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.change-banner {
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: #e6f6ec;
  color: #1c7a41;
  font-weight: 700;
  font-size: 1.1rem;
  text-align: center;
}

.change-banner--warning {
  background: #fbe9e7;
  color: #c0392b;
}

.checkout-modal__complete {
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid #111111;
  background: #111111;
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

.checkout-modal__complete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.checkout-modal__cancel {
  min-height: 52px;
  padding: 0 1.25rem;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.checkout-modal__status {
  font-size: 1.1rem;
  font-weight: 600;
  color: #444444;
}

.checkout-modal__error {
  color: #c0392b;
  font-weight: 600;
}

.checkout-error__actions {
  display: flex;
  gap: 0.75rem;
}

.checkout-success__label {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #444444;
}

.checkout-success__amount {
  margin: 0.25rem 0 0.5rem;
  font-size: 3rem;
  font-weight: 800;
  color: #1c7a41;
}

.checkout-success__order {
  margin: 0 0 1.5rem;
  color: #888888;
  font-size: 0.9rem;
}

@media (prefers-color-scheme: dark) {
  .checkout-modal {
    background: #242424;
  }

  .checkout-total {
    background: #2f2f2f;
  }

  .checkout-total__amount {
    color: #f2f2f2;
  }

  .checkout-total__amount-secondary {
    color: #777777;
  }

  .payment-method {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .payment-method--active {
    background: #ffffff;
    border-color: #ffffff;
    color: #111111;
  }

  .tendered-display__label {
    color: #dddddd;
  }

  .tendered-display__input-wrap input {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .fast-cash__button {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .checkout-modal__cancel {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .checkout-modal__complete {
    background: #ffffff;
    border-color: #ffffff;
    color: #111111;
  }

  .checkout-modal__complete:disabled {
    opacity: 0.35;
  }
}
</style>
