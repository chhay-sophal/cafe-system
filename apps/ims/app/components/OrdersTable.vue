<script setup lang="ts">
import { onMounted, watch } from "vue";
import type { OrderSummary } from "~/types/orders";

const { t } = useI18n();
const auth = useAuth();
const reportsStore = useReportsStore();
const ordersStore = useOrdersStore();
const { formatMain, formatSecondary } = useCurrency();

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
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ t("orders.columns.orderNumber") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ t("orders.columns.dateTime") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ t("orders.columns.cashier") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ t("orders.columns.items") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ t("orders.columns.payment") }}</th>
            <th class="px-4 py-3 text-right font-semibold text-slate-600">{{ t("orders.columns.total") }}</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="ordersStore.orders.length === 0">
            <td colspan="6" class="px-4 py-8 text-center text-slate-400">{{ t("orders.empty") }}</td>
          </tr>

          <tr
            v-for="order in ordersStore.orders"
            :key="order.id"
            class="cursor-pointer hover:bg-slate-50"
            @click="openDetail(order)"
          >
            <td class="px-4 py-3 font-medium text-slate-900">#{{ order.orderNumber }}</td>
            <td class="px-4 py-3 text-slate-700">{{ formatDateTime(order.createdAt) }}</td>
            <td class="px-4 py-3 text-slate-700">{{ order.cashierName ?? t("common.dash") }}</td>
            <td class="px-4 py-3 text-slate-700">{{ order.itemCount }}</td>
            <td class="px-4 py-3 text-slate-700">
              {{ order.paymentMethod ? t(`paymentBreakdown.methods.${order.paymentMethod}`) : t("common.dash") }}
            </td>
            <td class="px-4 py-3 text-right text-slate-700">
              {{ formatMain(order.totalAmount) }}
              <span class="block text-xs text-slate-400">{{ formatSecondary(order.totalAmount) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <OrderDetailModal />
  </div>
</template>
