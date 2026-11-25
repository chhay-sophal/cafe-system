<script setup lang="ts">
import { computed, watch } from "vue";

const store = useReportsStore();
const period = useSalesPeriodStore();

// Checked on every visit - the POS keeps adding sales, and the period may
// have changed on Sales History. A period picked while hidden loads on the
// next visit.
const { isVisible } = usePageVisible(() => store.loadIfStale());

const periodDays = computed(() => store.report?.dailyVolume?.length ?? 1);
// A daily trend needs two days or more; one day is covered by the hourly
// chart. Weekdays need two of each to compare.
const showTrend = computed(() => periodDays.value > 1);
const showWeekdays = computed(() => periodDays.value >= 14);
watch(
  () => [period.startDate, period.endDate],
  () => {
    if (isVisible.value) store.loadIfStale();
  },
);
// An order voided or edited from a card's details marks the report stale
// (stores/orders.ts) - reload it while it's on screen.
watch(
  () => store.loadedRange,
  (range) => {
    if (range === null && isVisible.value && store.hasLoadedOnce) store.loadIfStale();
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

      <SalesTrendChart v-if="showTrend" class="mb-4" />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProductsChart />
        <CategorySalesChart />
        <PaymentBreakdownChart />
        <!-- Next to the payments when there are no weekdays to show;
             otherwise the weekdays sit there and hours get a full row. -->
        <WeekdayChart v-if="showWeekdays" />
        <HourlyVolumeChart :class="{ 'lg:col-span-2': showWeekdays }" />
        <UnsoldItemsCard class="lg:col-span-2" />
      </div>
    </template>
  </div>
</template>
