<script setup lang="ts">
import { onMounted } from "vue";

const store = useReportsStore();

onMounted(() => {
  if (!store.hasLoadedOnce) {
    store.fetchReport();
  }
});
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-lg font-bold text-slate-900">{{ $t("analytics.heading") }}</h2>
      <DateRangePicker />
    </div>

    <p v-if="store.error" class="mb-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ store.error }}</p>

    <p v-else-if="store.isLoading && !store.hasLoadedOnce" class="p-6 text-center text-sm text-slate-500">
      {{ $t("analytics.loadingReport") }}
    </p>

    <template v-else>
      <DailySummaryCards class="mb-6" />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PaymentBreakdownChart />
        <HourlyVolumeChart />
      </div>

      <OrdersTable />
    </template>
  </div>
</template>
