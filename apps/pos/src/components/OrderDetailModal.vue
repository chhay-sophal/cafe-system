<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { voidOrder } from "../lib/api";
import { formatMain, formatRiel, formatSecondary, formatUsd } from "../lib/currency";
import { useExchangeRate } from "../composables/useExchangeRate";
import { useSalesHistory } from "../composables/useSalesHistory";
import type { OrderDetail, OrderDetailItem } from "../types/order";

const props = defineProps<{
  orderId: string;
  token: string;
}>();

const emit = defineEmits<{
  close: [];
  voided: [orderId: string, reason: string];
}>();

const { t } = useI18n({ useScope: "global" });
const { exchangeRateRielPerUsd, mainCurrency } = useExchangeRate();

const order = ref<OrderDetail | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

const isConfirmingVoid = ref(false);
const voidReason = ref("");
const isVoiding = ref(false);
const voidError = ref<string | null>(null);

const canVoid = computed(() => order.value?.status === "COMPLETED");
const canSubmitVoid = computed(() => voidReason.value.trim() !== "" && !isVoiding.value);

function format(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function formatSecondaryAmount(value: number): string {
  return formatSecondary(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

// Stored item prices exclude modifier extras, so the line total is rebuilt
// from the base price plus each modifier, same as the cart computes it.
function lineTotal(item: OrderDetailItem): number {
  const extras = item.modifiers.reduce((sum, modifier) => sum + modifier.priceExtra, 0);
  return (item.unitPrice + extras) * item.quantity;
}

function formatChange(usd: number, riel: number): string {
  if (usd > 0 && riel > 0) {
    return `${formatUsd(usd)} + ${formatRiel(riel)}`;
  }
  return riel > 0 ? formatRiel(riel) : formatUsd(usd);
}

async function loadOrder() {
  isLoading.value = true;
  loadError.value = null;
  try {
    // Cached after the first view - an invoice only changes by being voided
    // here, which updates the cache too.
    order.value = await useSalesHistory().loadOrderDetail(props.orderId, props.token);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t("orderDetail.loadError");
  } finally {
    isLoading.value = false;
  }
}

function startVoid() {
  isConfirmingVoid.value = true;
  voidReason.value = "";
  voidError.value = null;
}

function cancelVoid() {
  isConfirmingVoid.value = false;
  voidError.value = null;
}

async function confirmVoid() {
  if (!canSubmitVoid.value) {
    return;
  }

  isVoiding.value = true;
  voidError.value = null;
  try {
    const reason = voidReason.value.trim();
    await voidOrder(props.orderId, reason, props.token);
    emit("voided", props.orderId, reason);
  } catch (error) {
    voidError.value = error instanceof Error ? error.message : t("orderDetail.voidError");
  } finally {
    isVoiding.value = false;
  }
}

onMounted(loadOrder);
</script>

<template>
  <div class="order-backdrop" @click.self="emit('close')">
    <div class="order-modal" role="dialog" aria-modal="true" :aria-label="t('orderDetail.dialogAriaLabel')">
      <header class="order-modal__header">
        <h2>{{ order ? t("checkout.orderNumber", { number: order.orderNumber }) : t("orderDetail.dialogAriaLabel") }}</h2>
        <button type="button" class="order-modal__close" :aria-label="t('common.close')" @click="emit('close')">
          &times;
        </button>
      </header>

      <div v-if="isLoading" class="order-modal__body order-modal__body--centered">
        <p class="order-modal__muted">{{ t("orderDetail.loading") }}</p>
      </div>

      <div v-else-if="loadError || !order" class="order-modal__body order-modal__body--centered">
        <p class="order-modal__error">{{ loadError }}</p>
        <button type="button" class="order-modal__secondary" @click="loadOrder">{{ t("common.tryAgain") }}</button>
      </div>

      <div v-else class="order-modal__body">
        <div class="order-meta">
          <span>{{ order.createdAt.slice(11, 16) }}</span>
          <span v-if="order.cashierName">{{ order.cashierName }}</span>
          <span class="order-meta__status" :class="`order-meta__status--${order.status.toLowerCase()}`">
            {{ t(`salesHistory.status.${order.status}`) }}
          </span>
        </div>

        <p v-if="order.voidReason" class="order-modal__void-reason">
          {{ t("orderDetail.voidedReason", { reason: order.voidReason }) }}
        </p>

        <ul class="order-items">
          <li v-for="item in order.items" :key="item.id" class="order-items__row">
            <div class="order-items__main">
              <span>{{ item.quantity }} x {{ item.productName }}</span>
              <span class="order-items__amount">{{ format(lineTotal(item)) }}</span>
            </div>
            <ul v-if="item.modifiers.length > 0" class="order-items__modifiers">
              <li v-for="modifier in item.modifiers" :key="modifier.modifierName">+ {{ modifier.modifierName }}</li>
            </ul>
          </li>
        </ul>

        <dl class="order-totals">
          <div class="order-totals__row">
            <dt>{{ t("cart.subtotal") }}</dt>
            <dd>{{ format(order.subtotal) }}</dd>
          </div>
          <div v-if="order.taxAmount > 0" class="order-totals__row">
            <dt>{{ t("cart.tax") }}</dt>
            <dd>{{ format(order.taxAmount) }}</dd>
          </div>
          <div v-if="order.discountAmount > 0" class="order-totals__row">
            <dt>{{ t("cart.discount") }}</dt>
            <dd>-{{ format(order.discountAmount) }}</dd>
          </div>
          <div class="order-totals__row order-totals__row--total">
            <dt>{{ t("cart.total") }}</dt>
            <dd>
              {{ format(order.totalAmount) }}
              <span class="order-totals__secondary">{{ formatSecondaryAmount(order.totalAmount) }}</span>
            </dd>
          </div>
          <template v-if="order.payment">
            <div class="order-totals__row">
              <dt>{{ t("receipt.payment") }}</dt>
              <dd>{{ t(`checkout.methods.${order.payment.paymentMethod}`) }}</dd>
            </div>
            <template v-if="order.payment.paymentMethod === 'CASH'">
              <div v-if="order.payment.amountTenderedUsd > 0" class="order-totals__row">
                <dt>{{ t("receipt.tendered") }}</dt>
                <dd>{{ formatUsd(order.payment.amountTenderedUsd) }}</dd>
              </div>
              <div v-if="order.payment.amountTenderedRiel > 0" class="order-totals__row">
                <dt>{{ t("receipt.tendered") }}</dt>
                <dd>{{ formatRiel(order.payment.amountTenderedRiel) }}</dd>
              </div>
              <div class="order-totals__row">
                <dt>{{ t("checkout.changeDueLabel") }}</dt>
                <dd>{{ formatChange(order.payment.changeGivenUsd, order.payment.changeGivenRiel) }}</dd>
              </div>
            </template>
          </template>
        </dl>

        <div v-if="isConfirmingVoid" class="void-confirm">
          <p class="void-confirm__title">{{ t("orderDetail.voidConfirmTitle") }}</p>
          <label class="void-confirm__label" for="void-reason">{{ t("orderDetail.voidReason") }}</label>
          <textarea
            id="void-reason"
            v-model="voidReason"
            class="void-confirm__reason"
            rows="2"
            :placeholder="t('orderDetail.voidReasonPlaceholder')"
          />
          <p v-if="voidError" class="order-modal__error">{{ voidError }}</p>
          <div class="order-modal__actions">
            <button type="button" class="order-modal__secondary" :disabled="isVoiding" @click="cancelVoid">
              {{ t("common.cancel") }}
            </button>
            <button type="button" class="order-modal__danger" :disabled="!canSubmitVoid" @click="confirmVoid">
              {{ isVoiding ? t("orderDetail.voiding") : t("orderDetail.confirmVoid") }}
            </button>
          </div>
        </div>

        <div v-else class="order-modal__actions">
          <button v-if="canVoid" type="button" class="order-modal__danger" @click="startVoid">
            {{ t("orderDetail.voidOrder") }}
          </button>
          <button type="button" class="order-modal__secondary" @click="emit('close')">{{ t("common.close") }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.order-modal {
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.order-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: var(--color-primary);
  color: #ffffff;
}

.order-modal__header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.order-modal__close {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.order-modal__body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.order-modal__body--centered {
  align-items: center;
  text-align: center;
  padding: 3rem 1.5rem;
}

.order-modal__muted {
  margin: 0;
  color: #888888;
}

.order-modal__error {
  margin: 0;
  color: #c0392b;
  font-weight: 600;
}

.order-modal__void-reason {
  margin: 0;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  background: #fdecea;
  color: #c0392b;
  font-size: 0.9rem;
}

.order-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #777777;
  font-size: 0.9rem;
}

.order-meta__status {
  margin-left: auto;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.order-meta__status--completed {
  background: #e6f6ec;
  color: #1e7a3c;
}

.order-meta__status--voided,
.order-meta__status--refunded {
  background: #fdecea;
  color: #c0392b;
}

.order-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.order-items__main {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-weight: 600;
}

.order-items__amount {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.order-items__modifiers {
  list-style: none;
  margin: 0.15rem 0 0;
  padding-left: 1.25rem;
  color: #777777;
  font-size: 0.85rem;
}

.order-totals {
  margin: 0;
  padding-top: 0.75rem;
  border-top: 2px dashed #e2e2e2;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.order-totals__row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.95rem;
}

.order-totals__row dt,
.order-totals__row dd {
  margin: 0;
}

.order-totals__row dd {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.order-totals__row--total {
  font-size: 1.15rem;
  font-weight: 700;
}

.order-totals__secondary {
  display: block;
  font-size: 0.8rem;
  font-weight: 400;
  color: #888888;
}

.void-confirm {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem;
  border-radius: 12px;
  background: #fdecea;
}

.void-confirm__title {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
}

.void-confirm__label {
  font-size: 0.85rem;
  font-weight: 600;
}

.void-confirm__reason {
  width: 100%;
  padding: 0.6rem;
  border-radius: 8px;
  border: 2px solid #dcdcdc;
  font-size: 0.95rem;
  resize: vertical;
}

.order-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.order-modal__secondary,
.order-modal__danger {
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.order-modal__secondary {
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
}

.order-modal__danger {
  border: none;
  background: #c0392b;
  color: #ffffff;
}

.order-modal__secondary:disabled,
.order-modal__danger:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity, so they override light styles
   exactly as the prefers-color-scheme media query used to. */
:where(:root[data-theme="dark"]) .order-modal {
  background: #242424;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .order-modal__secondary {
  background: #2e2e2e;
  border-color: #3a3a3a;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .order-totals {
  border-top-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .void-confirm {
  background: #3a1f1c;
}

:where(:root[data-theme="dark"]) .void-confirm__reason {
  background: #1c1c1c;
  border-color: #3a3a3a;
  color: #f6f6f6;
}
</style>
