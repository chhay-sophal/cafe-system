<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { formatMain } from "../lib/currency";
import { formatReceiptDate } from "../lib/receipt";
import { useAuth } from "../composables/useAuth";
import { useExchangeRate } from "../composables/useExchangeRate";
import { useOfflineQueue } from "../composables/useOfflineQueue";
import type { QueuedOrder } from "../lib/offlineDb";
import type { OrderItemPayload } from "../types/order";

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n({ useScope: "global" });
const { exchangeRateRielPerUsd, mainCurrency } = useExchangeRate();
const auth = useAuth();
const queue = useOfflineQueue();

// Discarding throws away a sale the customer already paid for, so it's for
// managers/admins only (same roles as the Settings tab); anyone can retry.
const DISCARD_ROLES = ["MANAGER", "ADMIN"];
const canDiscard = computed(() => DISCARD_ROLES.includes(auth.session.value?.user.role ?? ""));

const busyId = ref<string | null>(null);
const confirmingDiscardId = ref<string | null>(null);

// Nothing left to review (all retried or discarded) - nothing to show.
watch(
  () => queue.failedOrders.value.length,
  (count) => {
    if (count === 0) {
      emit("close");
    }
  },
  { immediate: true },
);

function lineTotal(item: OrderItemPayload): number {
  const extras = (item.selectedModifiers ?? []).reduce((sum, modifier) => sum + modifier.priceExtra, 0);
  return (item.unitPrice + extras) * item.quantity;
}

function orderTotal(entry: QueuedOrder): number {
  const { items, taxAmount = 0, discountAmount = 0 } = entry.payload;
  return items.reduce((sum, item) => sum + lineTotal(item), 0) + taxAmount - discountAmount;
}

function soldAtLabel(entry: QueuedOrder): string {
  return formatReceiptDate(new Date(entry.payload.soldAt ?? entry.createdAt));
}

function format(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

async function retry(id: string) {
  busyId.value = id;
  confirmingDiscardId.value = null;
  try {
    await queue.retryFailed(id);
  } finally {
    busyId.value = null;
  }
}

async function discard(id: string) {
  busyId.value = id;
  try {
    await queue.discardFailed(id);
  } finally {
    busyId.value = null;
    confirmingDiscardId.value = null;
  }
}
</script>

<template>
  <div class="unsynced-backdrop" @click.self="emit('close')">
    <div class="unsynced-modal" role="dialog" aria-modal="true" :aria-label="t('unsynced.title')">
      <header class="unsynced-modal__header">
        <h2>{{ t("unsynced.title") }}</h2>
        <button type="button" class="unsynced-modal__close" :aria-label="t('common.close')" @click="emit('close')">
          &times;
        </button>
      </header>

      <div class="unsynced-modal__body">
        <p class="unsynced-modal__intro">{{ t("unsynced.intro") }}</p>

        <article v-for="entry in queue.failedOrders.value" :key="entry.id" class="unsynced-order">
          <div class="unsynced-order__meta">
            <span>{{ soldAtLabel(entry) }}</span>
            <span v-if="entry.cashierName">{{ entry.cashierName }}</span>
            <span>{{ t(`checkout.methods.${entry.payload.paymentMethod}`) }}</span>
            <strong class="unsynced-order__total">{{ format(orderTotal(entry)) }}</strong>
          </div>

          <ul class="unsynced-order__items">
            <li v-for="(item, index) in entry.payload.items" :key="index">
              {{ item.quantity }} x {{ item.productName }}
              <span v-if="item.selectedModifiers?.length" class="unsynced-order__modifiers">
                ({{ item.selectedModifiers.map((modifier) => modifier.name).join(", ") }})
              </span>
            </li>
          </ul>

          <p v-if="entry.lastError" class="unsynced-order__error">
            {{ t("unsynced.serverSaid", { error: entry.lastError }) }}
          </p>

          <div v-if="confirmingDiscardId === entry.id" class="unsynced-order__confirm">
            <p>{{ t("unsynced.confirmDiscard") }}</p>
            <div class="unsynced-order__actions">
              <button type="button" class="unsynced-modal__secondary" :disabled="busyId !== null" @click="confirmingDiscardId = null">
                {{ t("common.cancel") }}
              </button>
              <button type="button" class="unsynced-modal__danger" :disabled="busyId !== null" @click="discard(entry.id)">
                {{ t("unsynced.discardSale") }}
              </button>
            </div>
          </div>

          <div v-else class="unsynced-order__actions">
            <button
              v-if="canDiscard"
              type="button"
              class="unsynced-modal__secondary"
              :disabled="busyId !== null"
              @click="confirmingDiscardId = entry.id"
            >
              {{ t("unsynced.discard") }}
            </button>
            <button type="button" class="unsynced-modal__primary" :disabled="busyId !== null" @click="retry(entry.id)">
              {{ busyId === entry.id ? t("unsynced.retrying") : t("common.tryAgain") }}
            </button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unsynced-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.unsynced-modal {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #1a1a1a;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.unsynced-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #c0392b;
  color: #ffffff;
}

.unsynced-modal__header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.unsynced-modal__close {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.unsynced-modal__body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.unsynced-modal__intro {
  margin: 0;
  color: #555555;
  font-size: 0.9rem;
  line-height: 1.45;
}

.unsynced-order {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem;
  border: 2px solid #e2e2e2;
  border-radius: 14px;
}

.unsynced-order__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.75rem;
  color: #777777;
  font-size: 0.9rem;
}

.unsynced-order__total {
  margin-left: auto;
  color: #1a1a1a;
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}

.unsynced-order__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-weight: 600;
}

.unsynced-order__modifiers {
  color: #777777;
  font-weight: 400;
  font-size: 0.85rem;
}

.unsynced-order__error {
  margin: 0;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  background: #fdecea;
  color: #c0392b;
  font-size: 0.9rem;
}

.unsynced-order__confirm {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem;
  border-radius: 12px;
  background: #fdecea;
}

.unsynced-order__confirm p {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
}

.unsynced-order__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.unsynced-modal__primary,
.unsynced-modal__secondary,
.unsynced-modal__danger {
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.unsynced-modal__primary {
  border: none;
  background: var(--color-primary);
  color: #ffffff;
}

.unsynced-modal__secondary {
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
}

.unsynced-modal__danger {
  border: none;
  background: #c0392b;
  color: #ffffff;
}

.unsynced-modal__primary:disabled,
.unsynced-modal__secondary:disabled,
.unsynced-modal__danger:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. */
:where(:root[data-theme="dark"]) .unsynced-modal {
  background: #242424;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .unsynced-modal__intro,
:where(:root[data-theme="dark"]) .unsynced-order__meta,
:where(:root[data-theme="dark"]) .unsynced-order__modifiers {
  color: #aaaaaa;
}

:where(:root[data-theme="dark"]) .unsynced-order {
  border-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .unsynced-order__total {
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .unsynced-order__error,
:where(:root[data-theme="dark"]) .unsynced-order__confirm {
  background: #3a1f1c;
}

:where(:root[data-theme="dark"]) .unsynced-order__error,
:where(:root[data-theme="dark"]) .unsynced-order__confirm p {
  color: #ff8a80;
}

:where(:root[data-theme="dark"]) .unsynced-modal__secondary {
  background: #2e2e2e;
  border-color: #3a3a3a;
  color: #f6f6f6;
}
</style>
