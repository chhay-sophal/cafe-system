<script setup lang="ts">
import { onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { OrderSummary } from "~/types/orders";

const { t } = useI18n();
const auth = useAuth();
const reportsStore = useReportsStore();
const ordersStore = useOrdersStore();
const { orders } = storeToRefs(ordersStore);
const { formatMain, formatSecondary } = useCurrency();

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, OrderSummary>();

const columns = columnHelper.columns([
  columnHelper.accessor("orderNumber", {
    header: () => t("orders.columns.orderNumber"),
    cell: ({ getValue }) => `#${getValue()}`,
  }),
  columnHelper.accessor("createdAt", {
    header: () => t("orders.columns.dateTime"),
    cell: ({ getValue }) => formatDateTime(getValue()),
  }),
  columnHelper.accessor("cashierName", {
    header: () => t("orders.columns.cashier"),
    cell: ({ getValue }) => getValue() ?? t("common.dash"),
  }),
  columnHelper.accessor("itemCount", { header: () => t("orders.columns.items") }),
  columnHelper.accessor("paymentMethod", {
    header: () => t("orders.columns.payment"),
    cell: ({ getValue }) => {
      const method = getValue();
      return method ? t(`paymentBreakdown.methods.${method}`) : t("common.dash");
    },
  }),
  // Rendered via slot - shows the total in both currencies.
  columnHelper.accessor("totalAmount", { header: () => t("orders.columns.total") }),
]);

const cellClass = {
  orderNumber: "px-4 py-3 font-medium text-slate-900",
  totalAmount: "px-4 py-3 text-right text-slate-700",
};

const headerClass = {
  totalAmount: "px-4 py-3 text-right font-semibold text-slate-600",
};

const table = useTable({ features, columns, data: orders });

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
    <h3 class="mb-3 text-sm font-semibold text-slate-700">{{ t("orders.heading") }}</h3>

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
        :empty-text="t('orders.empty')"
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
