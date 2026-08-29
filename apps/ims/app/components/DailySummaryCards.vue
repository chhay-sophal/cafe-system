<script setup lang="ts">
import { computed } from "vue";

const { t } = useI18n();
const store = useReportsStore();
const { formatMain, formatSecondary } = useCurrency();

const averageOrderValue = computed(() => {
  const orders = store.report?.metrics.totalOrders ?? 0;
  const net = store.report?.metrics.netRevenue ?? 0;
  return orders > 0 ? net / orders : 0;
});

const cards = computed(() => [
  {
    label: t("summaryCards.grossRevenue"),
    value: formatMain(store.report?.metrics.grossRevenue ?? 0),
    subValue: formatSecondary(store.report?.metrics.grossRevenue ?? 0),
  },
  {
    label: t("summaryCards.netRevenue"),
    value: formatMain(store.report?.metrics.netRevenue ?? 0),
    subValue: formatSecondary(store.report?.metrics.netRevenue ?? 0),
  },
  { label: t("summaryCards.orders"), value: String(store.report?.metrics.totalOrders ?? 0), subValue: null },
  {
    label: t("summaryCards.averageOrderValue"),
    value: formatMain(averageOrderValue.value),
    subValue: formatSecondary(averageOrderValue.value),
  },
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
      <p v-if="card.subValue" class="mt-0.5 text-xs text-slate-400">{{ card.subValue }}</p>
    </div>
  </div>
</template>
