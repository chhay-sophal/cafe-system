<script setup lang="ts">
import { watch } from "vue";

const store = useReportsStore();
const period = useSalesPeriodStore();

// Checked on every visit - the POS keeps adding sales, and the period may
// have changed on Sales History. A period picked while hidden loads on the
// next visit.
const { isVisible } = usePageVisible(() => store.loadIfStale());
watch(
  () => [period.startDate, period.endDate],
  () => {
    if (isVisible.value) store.loadIfStale();
  },
);
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-bold text-slate-900">{{ $t("analytics.heading") }}</h2>
      <DateRangePicker />
    </div>

    <p v-if="store.error" class="mb-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ store.error }}</p>

    <p v-else-if="store.isLoading && !store.hasLoadedOnce" class="p-6 text-center text-sm text-slate-500">
      {{ $t("analytics.loadingReport") }}
    </p>

    <template v-else>
      <DailySummaryCards class="mb-6" />

      <SalesTrendChart class="mb-4" />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProductsChart />
        <PaymentBreakdownChart />
        <HourlyVolumeChart class="lg:col-span-2" />
      </div>
    </template>
  </div>
</template>
