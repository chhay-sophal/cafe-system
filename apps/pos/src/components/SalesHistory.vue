<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatMain, formatSecondary } from "../lib/currency";
import { useExchangeRate } from "../composables/useExchangeRate";
import { useOfflineQueue } from "../composables/useOfflineQueue";
import { useSalesHistory } from "../composables/useSalesHistory";
import OrderDetailModal from "./OrderDetailModal.vue";
import type { PaymentMethod } from "../types/order";

const props = defineProps<{
  token: string;
}>();

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "QR_CODE"];

const { t } = useI18n({ useScope: "global" });
const { exchangeRateRielPerUsd, mainCurrency } = useExchangeRate();
const offlineQueue = useOfflineQueue();
const salesHistory = useSalesHistory();

// Cached across tab switches - see useSalesHistory for when it refetches.
const orders = salesHistory.orders;
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const selectedOrderId = ref<string | null>(null);

// Voided/refunded orders stay visible in the table but don't count as sales.
const completedOrders = computed(() => orders.value.filter((order) => order.status === "COMPLETED"));

const totalSales = computed(() => completedOrders.value.reduce((sum, order) => sum + order.totalAmount, 0));

const salesByMethod = computed(() =>
  PAYMENT_METHODS.map((method) => ({
    method,
    total: completedOrders.value
      .filter((order) => order.paymentMethod === method)
      .reduce((sum, order) => sum + order.totalAmount, 0),
  })),
);

function format(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function formatSecondaryAmount(value: number): string {
  return formatSecondary(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

// createdAt arrives as store-local "YYYY-MM-DD HH:MM:SS"; the list is
// already limited to today, so only the time is worth showing.
function formatTime(createdAt: string): string {
  return createdAt.slice(11, 16);
}

// `force` is the Refresh button: always ask the backend, e.g. for sales the
// same cashier made on another register.
async function loadOrders(force = false) {
  if (!force && !salesHistory.needsReload(props.token)) {
    return;
  }
  isLoading.value = true;
  errorMessage.value = null;
  try {
    // Already sorted newest first by the backend.
    await salesHistory.loadOrders(props.token, { force });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("salesHistory.loadError");
  } finally {
    isLoading.value = false;
  }
}

// A void only flips the status, so it's patched locally - the summary
// cards recompute from the rows without another request.
function handleVoided(orderId: string, reason: string) {
  selectedOrderId.value = null;
  salesHistory.markVoided(orderId, reason);
}

onMounted(() => loadOrders());
</script>

<template>
  <section class="sales-history">
    <div class="sales-history__toolbar">
      <h2 class="sales-history__heading">{{ t("salesHistory.heading") }}</h2>
      <button type="button" class="sales-history__refresh" :disabled="isLoading" @click="loadOrders(true)">
        {{ t("salesHistory.refresh") }}
      </button>
    </div>

    <p v-if="offlineQueue.pendingCount.value > 0" class="sales-history__pending">
      {{ t("salesHistory.pendingNote", { count: offlineQueue.pendingCount.value }) }}
    </p>

    <div class="sales-summary">
      <div class="sales-summary__card">
        <span class="sales-summary__label">{{ t("salesHistory.orders") }}</span>
        <span class="sales-summary__value">{{ completedOrders.length }}</span>
      </div>
      <div class="sales-summary__card">
        <span class="sales-summary__label">{{ t("salesHistory.totalSales") }}</span>
        <span class="sales-summary__value">{{ format(totalSales) }}</span>
        <span class="sales-summary__secondary">{{ formatSecondaryAmount(totalSales) }}</span>
      </div>
      <div v-for="entry in salesByMethod" :key="entry.method" class="sales-summary__card">
        <span class="sales-summary__label">{{ t(`checkout.methods.${entry.method}`) }}</span>
        <span class="sales-summary__value sales-summary__value--small">{{ format(entry.total) }}</span>
      </div>
    </div>

    <div class="sales-table-wrap">
      <p v-if="isLoading" class="sales-history__status">{{ t("salesHistory.loading") }}</p>
      <p v-else-if="errorMessage" class="sales-history__status sales-history__status--error">{{ errorMessage }}</p>
      <p v-else-if="orders.length === 0" class="sales-history__status">{{ t("salesHistory.empty") }}</p>

      <table v-else class="sales-table">
        <thead>
          <tr>
            <th>{{ t("salesHistory.columns.time") }}</th>
            <th>{{ t("salesHistory.columns.order") }}</th>
            <th class="sales-table__numeric">{{ t("salesHistory.columns.items") }}</th>
            <th>{{ t("salesHistory.columns.payment") }}</th>
            <th class="sales-table__numeric">{{ t("salesHistory.columns.total") }}</th>
            <th>{{ t("salesHistory.columns.status") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="order in orders"
            :key="order.id"
            class="sales-table__row"
            :class="{ 'sales-table__row--inactive': order.status !== 'COMPLETED' }"
            tabindex="0"
            @click="selectedOrderId = order.id"
            @keydown.enter="selectedOrderId = order.id"
          >
            <td>{{ formatTime(order.createdAt) }}</td>
            <td>#{{ order.orderNumber }}</td>
            <td class="sales-table__numeric">{{ order.itemCount }}</td>
            <td>{{ order.paymentMethod ? t(`checkout.methods.${order.paymentMethod}`) : "-" }}</td>
            <td class="sales-table__numeric">{{ format(order.totalAmount) }}</td>
            <td>
              <span class="sales-table__status" :class="`sales-table__status--${order.status.toLowerCase()}`">
                {{ t(`salesHistory.status.${order.status}`) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <OrderDetailModal
      v-if="selectedOrderId"
      :order-id="selectedOrderId"
      :token="token"
      @close="selectedOrderId = null"
      @voided="handleVoided"
    />
  </section>
</template>

<style scoped>
.sales-history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  overflow-y: auto;
}

.sales-history__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sales-history__heading {
  margin: 0;
  font-size: 1.25rem;
}

.sales-history__refresh {
  min-height: 44px;
  padding: 0 1.25rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.sales-history__refresh:disabled {
  opacity: 0.5;
  cursor: default;
}

.sales-history__pending {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: #fdecea;
  color: #c0392b;
  font-size: 0.9rem;
  font-weight: 600;
}

.sales-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
}

.sales-summary__card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  border-radius: 14px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
}

.sales-summary__label {
  font-size: 0.85rem;
  color: #777777;
}

.sales-summary__value {
  font-size: 1.6rem;
  font-weight: 700;
}

.sales-summary__value--small {
  font-size: 1.2rem;
}

.sales-summary__secondary {
  font-size: 0.85rem;
  color: #888888;
}

.sales-table-wrap {
  border-radius: 14px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
  overflow: hidden;
}

.sales-history__status {
  margin: 0;
  padding: 2rem;
  text-align: center;
  color: #888888;
}

.sales-history__status--error {
  color: #c0392b;
}

.sales-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.sales-table th,
.sales-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #eeeeee;
}

.sales-table th {
  font-size: 0.8rem;
  font-weight: 700;
  color: #777777;
  background: #fafafa;
}

.sales-table__row {
  cursor: pointer;
}

.sales-table__row:hover td,
.sales-table__row:focus-visible td {
  background: #c3c3c3;
}

.sales-table tbody tr:last-child td {
  border-bottom: none;
}

.sales-table__numeric {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
}

.sales-table__row--inactive td {
  color: #999999;
}

.sales-table__row--inactive .sales-table__numeric {
  text-decoration: line-through;
}

.sales-table__status {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.sales-table__status--completed {
  background: #e6f6ec;
  color: #1e7a3c;
}

.sales-table__status--voided,
.sales-table__status--refunded {
  background: #fdecea;
  color: #c0392b;
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity, so they override light styles
   exactly as the prefers-color-scheme media query used to. */
:where(:root[data-theme="dark"]) .sales-history__refresh,
:where(:root[data-theme="dark"]) .sales-summary__card,
:where(:root[data-theme="dark"]) .sales-table-wrap {
  background: #242424;
  border-color: #3a3a3a;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .sales-table th {
  background: #1c1c1c;
  color: #aaaaaa;
}

:where(:root[data-theme="dark"]) .sales-table th,
:where(:root[data-theme="dark"]) .sales-table td {
  border-bottom-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .sales-table__row:hover td,
:where(:root[data-theme="dark"]) .sales-table__row:focus-visible td {
  background: #2e2e2e;
}

:where(:root[data-theme="dark"]) .sales-history__pending {
  background: #3a1f1c;
  color: #ff8a7a;
}
</style>
