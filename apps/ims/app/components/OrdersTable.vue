<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { RefreshCw } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { columnVisibilityFeature, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { OrderSummary, PaymentMethod } from "~/types/orders";
import type { TableFilterDef } from "~/types/table";

const { t, locale } = useI18n();
const auth = useAuth();
const period = useSalesPeriodStore();
const ordersStore = useOrdersStore();
const { orders } = storeToRefs(ordersStore);
const { formatMain, formatSecondary } = useCurrency();

const features = tableFeatures({ ...sortingFeatures, ...filteringFeatures, ...paginationFeatures, columnVisibilityFeature });
const columnHelper = createColumnHelper<typeof features, OrderSummary>();

const columns = columnHelper.columns([
  columnHelper.accessor("orderNumber", {
    header: () => t("orders.columns.orderNumber"),
    cell: ({ getValue }) => `#${getValue()}`,
  }),
  // The page's date range already narrows orders by date, and numbers as
  // search text match too loosely ("2" in any total) - so search covers the
  // order number, cashier, payment method and the items sold; the filter
  // panel has ranges for items and total.
  columnHelper.accessor("createdAt", {
    header: () => t("orders.columns.dateTime"),
    cell: ({ getValue }) => formatDateTime(getValue(), locale.value),
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
  // Rendered via slot as badges; this text is what search matches.
  columnHelper.accessor("status", {
    header: () => t("orders.columns.status"),
    cell: ({ row }) =>
      [t(`orders.status.${row.original.status}`), row.original.isEdited ? t("orders.edited") : null].filter(Boolean).join(" · "),
    filterFn: "equals",
  }),
  // Rendered via slot - shows the total in both currencies.
  columnHelper.accessor("totalAmount", {
    header: () => t("orders.columns.total"),
    filterFn: "inNumberRange",
    enableGlobalFilter: false,
  }),
  // Hidden: the items sold, as search text ("latte" finds every order with
  // a latte) and as ids for the Item filter.
  columnHelper.accessor((order) => (order.products ?? []).map((product) => product.name).join(", "), {
    id: "productNames",
    enableSorting: false,
  }),
  columnHelper.accessor((order) => (order.products ?? []).map((product) => product.id), {
    id: "product",
    filterFn: "contains",
    enableGlobalFilter: false,
    enableSorting: false,
  }),
]);

const cellClass = {
  orderNumber: "px-4 py-3 font-medium text-slate-900",
  totalAmount: "px-4 py-3 text-right text-slate-700",
};

const headerClass = {
  totalAmount: "px-4 py-3 text-right font-semibold text-slate-600",
};

const table = useTable({
  features,
  columns,
  data: orders,
  globalFilterFn: "includesDisplayText",
  initialState: {
    pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE },
    columnVisibility: { productNames: false, product: false },
  },
  // Page resets are TablePagination's job - see its rowCount watcher.
  autoResetPageIndex: false,
});

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "QR_CODE"];

// Products sold in the loaded period, by id. Orders keep the name as rung
// up; the list is newest first, so a renamed product shows its latest name.
const soldProducts = computed(() => {
  const names = new Map<string, string>();
  for (const order of orders.value) {
    for (const { id, name } of order.products ?? []) {
      if (!names.has(id)) {
        names.set(id, name);
      }
    }
  }
  return [...names].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
});

const filters = computed<TableFilterDef[]>(() => [
  { type: "select", columnId: "product", label: t("orders.itemFilter"), options: soldProducts.value },
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
  {
    type: "select",
    columnId: "status",
    label: t("orders.columns.status"),
    options: (["COMPLETED", "VOIDED"] as const).map((status) => ({ value: status, label: t(`orders.status.${status}`) })),
  },
  { type: "numberRange", columnId: "itemCount", label: t("orders.columns.items") },
  // Totals are stored in USD whatever the display currency (see
  // useCurrency), so the range is in USD and says so.
  { type: "numberRange", columnId: "totalAmount", label: t("orders.totalUsd") },
]);

// "No orders in this period" would be wrong when the period has orders but
// the search or filters hide them all.
const emptyText = computed(() => (orders.value.length > 0 ? t("orders.noMatches") : t("orders.empty")));

// Reuses the list already loaded for this period if it's recent (see
// utils/cache.ts); Refresh always reloads, for a sale that just happened.
function loadOrders({ force = false } = {}) {
  const token = auth.session.value?.token;
  if (!token) {
    return;
  }
  if (force) {
    ordersStore.fetchOrders(period.startDate, period.endDate, token);
  } else {
    ordersStore.ensureOrders(period.startDate, period.endDate, token);
  }
}

onMounted(() => loadOrders());
watch(() => [period.startDate, period.endDate], () => loadOrders());

function openDetail(order: OrderSummary) {
  const token = auth.session.value?.token;
  if (!token) {
    return;
  }
  ordersStore.fetchOrderDetail(order.id, token);
}
</script>

<template>
  <!-- The Sales History page - laid out like the other table pages (Stock,
       Menu...): toolbar on top, table filling the rest. -->
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <TableFilters :table="table" :search-placeholder="t('orders.searchPlaceholder')" :filters="filters" />
      <button
        type="button"
        class="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        :disabled="ordersStore.isLoading"
        @click="loadOrders({ force: true })"
      >
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': ordersStore.isLoading }" aria-hidden="true" />
        {{ t("orders.refresh") }}
      </button>
      <DateRangePicker />
    </div>

    <p v-if="ordersStore.error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ ordersStore.error }}</p>

    <p v-else-if="ordersStore.isLoading && !ordersStore.hasLoadedOnce" class="p-6 text-center text-sm text-slate-500">
      {{ t("orders.loading") }}
    </p>

    <div
      v-else
      class="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 transition-opacity duration-150"
      :class="{ 'opacity-50': ordersStore.isLoading && ordersStore.hasLoadedOnce }"
    >
      <DataTable
        :table="table"
        :empty-text="emptyText"
        :cell-class="cellClass"
        :header-class="headerClass"
        :row-class="(row) => ['cursor-pointer hover:bg-slate-50', row.original.status === 'VOIDED' && 'text-slate-400']"
        @row-click="openDetail"
      >
        <template #cell-status="{ item }">
          <span class="inline-flex flex-wrap gap-1">
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold"
              :class="item.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'"
            >
              {{ t(`orders.status.${item.status}`) }}
            </span>
            <span v-if="item.isEdited" class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {{ t("orders.edited") }}
            </span>
          </span>
        </template>
        <template #cell-totalAmount="{ item }">
          {{ formatMain(item.totalAmount) }}
          <span class="block text-xs text-slate-400">{{ formatSecondary(item.totalAmount) }}</span>
        </template>
      </DataTable>
    </div>

    <TablePagination :table="table" />

    <OrderDetailModal />
  </div>
</template>
