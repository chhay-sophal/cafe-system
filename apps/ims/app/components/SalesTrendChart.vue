<script setup lang="ts">
import { computed, ref } from "vue";
import { Chart as ChartJS, registerables, type TooltipItem } from "chart.js";
import { Bar } from "vue-chartjs";

ChartJS.register(...registerables);

const { t, locale } = useI18n();
const store = useReportsStore();
const { formatMain, formatSecondary } = useCurrency();

const showTable = ref(false);

const days = computed(() => store.report?.dailyVolume ?? []);
const hasData = computed(() => days.value.some((day) => day.orderCount > 0));

// Daily revenue only, on one axis - order counts are in the tooltip and the
// table rather than on a second scale.
const chartData = computed(() => ({
  labels: days.value.map((day) => formatShortDate(day.date, locale.value)),
  datasets: [
    {
      label: t("salesTrend.revenue"),
      data: days.value.map((day) => day.revenue),
      // Single series, so it takes the brand colour (tailwind.config.ts).
      backgroundColor: "#6f4e37",
      borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
      maxBarThickness: 32,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#898781", autoSkip: true, maxRotation: 0 },
    },
    y: {
      beginAtZero: true,
      ticks: { color: "#898781", maxTicksLimit: 6, callback: (value: string | number) => formatMain(Number(value)) },
      grid: { color: "#e1e0d9" },
      border: { display: false },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title(items: TooltipItem<"bar">[]) {
          const day = days.value[items[0]?.dataIndex ?? 0];
          return day ? formatDateLabel(day.date, locale.value) : "";
        },
        label(context: TooltipItem<"bar">) {
          const day = days.value[context.dataIndex];
          return ` ${formatMain(day?.revenue ?? 0)} – ${t("hourlyVolume.orderCount", day?.orderCount ?? 0)}`;
        },
      },
    },
  },
}));
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">{{ $t("salesTrend.heading") }}</h3>
      <button
        v-if="hasData"
        type="button"
        class="text-xs font-semibold text-slate-500 hover:text-slate-700"
        @click="showTable = !showTable"
      >
        {{ showTable ? $t("common.viewChart") : $t("common.viewTable") }}
      </button>
    </div>

    <p v-if="!hasData" class="flex h-64 items-center justify-center text-center text-sm text-slate-400">
      {{ $t("salesTrend.noData") }}
    </p>

    <div v-else-if="showTable" class="max-h-64 overflow-y-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-slate-500">
            <th class="py-2 font-medium">{{ $t("salesTrend.date") }}</th>
            <th class="py-2 text-right font-medium">{{ $t("hourlyVolume.orders") }}</th>
            <th class="py-2 text-right font-medium">{{ $t("salesTrend.revenue") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="day in days" :key="day.date" class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ formatDateLabel(day.date, locale) }}</td>
            <td class="py-2 text-right font-medium text-slate-900">{{ day.orderCount }}</td>
            <td class="py-2 text-right text-slate-500">
              {{ formatMain(day.revenue) }}
              <span class="block text-xs text-slate-400">{{ formatSecondary(day.revenue) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-else
      class="h-64 transition-opacity duration-150"
      :class="{ 'opacity-50': store.isLoading && store.hasLoadedOnce }"
    >
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
