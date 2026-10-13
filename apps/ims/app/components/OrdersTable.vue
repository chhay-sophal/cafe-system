<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { OrderSummary, PaymentMethod } from "~/types/orders";
import type { TableFilterDef } from "~/types/table";

const { t } = useI18n();
const auth = useAuth();
const reportsStore = useReportsStore();
const ordersStore = useOrdersStore();
const { orders } = storeToRefs(ordersStore);
const { formatMain, formatSecondary } = useCurrency();

const features = tableFeatures({ ...sortingFeatures, ...filteringFeatures });
const columnHelper = createColumnHelper<typeof features, OrderSummary>();

const columns = columnHelper.columns([
  columnHelper.accessor("orderNumber", {
    header: () => t("orders.columns.orderNumber"),
    cell: ({ getValue }) => `#${getValue()}`,
  }),
  // The page's date range already narrows orders by date, and numbers as
  // search text match too loosely ("2" in any total) - so search covers the
  // order number, cashier and payment method only; the filter panel has
  // ranges for items and total.
  columnHelper.accessor("createdAt", {
    header: () => t("orders.columns.dateTime"),
    cell: ({ getValue }) => formatDateTime(getValue()),
    enableGlobalFilter: false,
  }),
  columnHelper.accessor("cashierName", {
    header: () => t("orders.columns.cashier"),
    cell: ({ getValue }) => getValue() ?? t("common.dash"),
    filterFn: "equals",
  }),
  columnHelper.accessor("itemCount", {
    header: () => t("orders.columns.items"),
    filterFn: "inNumberRange",
    enableGlobalFilter: false,
  }),
  columnHelper.accessor("paymentMethod", {
    header: () => t("orders.columns.payment"),
    cell: ({ getValue }) => {
      const method = getValue();
      return method ? t(`paymentBreakdown.methods.${method}`) : t("common.dash");
    },
    filterFn: "equals",
  }),
  // Rendered via slot - shows the total in both currencies.
  columnHelper.accessor("totalAmount", {
    header: () => t("orders.columns.total"),
    filterFn: "inNumberRange",
    enableGlobalFilter: false,
  }),
]);

const cellClass = {
  orderNumber: "px-4 py-3 font-medium text-slate-900",
  totalAmount: "px-4 py-3 text-right text-slate-700",
};

const headerClass = {
  totalAmount: "px-4 py-3 text-right font-semibold text-slate-600",
};

const table = useTable({ features, columns, data: orders, globalFilterFn: "includesDisplayText" });

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "QR_CODE"];

const filters = computed<TableFilterDef[]>(() => [
  {
    type: "select",
    columnId: "cashierName",
    label: t("orders.columns.cashier"),
    // Only cashiers who appear in the loaded period - the list follows the
    // page's date range.
    options: [...new Set(orders.value.flatMap((order) => (order.cashierName ? [order.cashierName] : [])))]
      .sort()
      .map((name) => ({ value: name, label: name })),
  },
  {
    type: "select",
    columnId: "paymentMethod",
    label: t("orders.columns.payment"),
    options: PAYMENT_METHODS.map((method) => ({ value: method, label: t(`paymentBreakdown.methods.${method}`) })),
  },
  { type: "numberRange", columnId: "itemCount", label: t("orders.columns.items") },
  // Totals are stored in USD whatever the display currency (see
  // useCurrency), so the range is in USD and says so.
  { type: "numberRange", columnId: "totalAmount", label: t("orders.totalUsd") },
]);

// "No orders in this period" would be wrong when the period has orders but
// the search or filters hide them all.
const emptyText = computed(() => (orders.value.length > 0 ? t("orders.noMatches") : t("orders.empty")));

function loadOrders() {
  const token = auth.session.value?.token;
  if (!token) {
    return;
  }
  ordersStore.fetchOrders(reportsStore.startDate, reportsStore.endDate, token);
}

onMounted(loadOrders);
watch(() => [reportsStore.startDate, reportsStore.endDate], loadOrders);

function formatDateTime(value: string): string {
  return new Date(value.replace(" ", "T")).toLocaleString();
}

function openDetail(order: OrderSummary) {
  const token = auth.session.value?.token;
  if (!token) {
    return;
  }
  ordersStore.fetchOrderDetail(order.id, token);
}
</script>

<template>
  <div class="mt-6">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h3 class="text-sm font-semibold text-slate-700">{{ t("orders.heading") }}</h3>
      <TableFilters :table="table" :search-placeholder="t('orders.searchPlaceholder')" :filters="filters" />
    </div>

    <p v-if="ordersStore.error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ ordersStore.error }}</p>

    <p v-else-if="ordersStore.isLoading && !ordersStore.hasLoadedOnce" class="p-6 text-center text-sm text-slate-500">
      {{ t("orders.loading") }}
    </p>

    <div
      v-else
      class="overflow-x-auto rounded-lg border border-slate-200 transition-opacity duration-150"
      :class="{ 'opacity-50': ordersStore.isLoading && ordersStore.hasLoadedOnce }"
    >
      <DataTable
        :table="table"
        :empty-text="emptyText"
        :cell-class="cellClass"
        :header-class="headerClass"
        :row-class="() => 'cursor-pointer hover:bg-slate-50'"
        @row-click="openDetail"
      >
        <template #cell-totalAmount="{ item }">
          {{ formatMain(item.totalAmount) }}
          <span class="block text-xs text-slate-400">{{ formatSecondary(item.totalAmount) }}</span>
        </template>
      </DataTable>
    </div>

    <OrderDetailModal />
  </div>
</template>
