<script setup lang="ts">
import { computed } from "vue";

const { t } = useI18n();
const store = useReportsStore();

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

const averageOrderValue = computed(() => {
  const orders = store.report?.metrics.totalOrders ?? 0;
  const net = store.report?.metrics.netRevenue ?? 0;
  return orders > 0 ? net / orders : 0;
});

const cards = computed(() => [
  { label: t("summaryCards.grossRevenue"), value: formatCurrency(store.report?.metrics.grossRevenue ?? 0) },
  { label: t("summaryCards.netRevenue"), value: formatCurrency(store.report?.metrics.netRevenue ?? 0) },
  { label: t("summaryCards.orders"), value: String(store.report?.metrics.totalOrders ?? 0) },
  { label: t("summaryCards.averageOrderValue"), value: formatCurrency(averageOrderValue.value) },
]);
</script>

<template>
  <div
    class="grid grid-cols-1 gap-4 transition-opacity duration-150 sm:grid-cols-2 lg:grid-cols-4"
    :class="{ 'opacity-50': store.isLoading && store.hasLoadedOnce }"
  >
    <div v-for="card in cards" :key="card.label" class="rounded-lg border border-slate-200 bg-white p-4">
      <p class="text-sm text-slate-500">{{ card.label }}</p>
      <p class="mt-1 text-2xl font-semibold text-slate-900">{{ card.value }}</p>
    </div>
  </div>
</template>
