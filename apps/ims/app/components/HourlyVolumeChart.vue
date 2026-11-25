<script setup lang="ts">
import { computed, ref } from "vue";
import { Chart as ChartJS, registerables, type TooltipItem } from "chart.js";
import { Bar } from "vue-chartjs";

ChartJS.register(...registerables);

const { t } = useI18n();
const store = useReportsStore();

const showTable = ref(false);

const { formatMain, formatSecondary } = useCurrency();

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

// Over several days the totals would grow with the range, so they're shown
// as the average day instead - comparable between a week and a month.
const periodDays = computed(() => Math.max(store.report?.dailyVolume?.length ?? 1, 1));
const isAverage = computed(() => periodDays.value > 1);

const hourlyVolume = computed(() =>
  (store.report?.hourlyVolume ?? []).map((entry) => ({
    hour: entry.hour,
    orderCount: entry.orderCount / periodDays.value,
    revenue: entry.revenue / periodDays.value,
  })),
);
const hasData = computed(() => hourlyVolume.value.some((entry) => entry.orderCount > 0));

function formatOrders(value: number): string {
  return isAverage.value ? value.toFixed(1).replace(/\.0$/, "") : String(value);
}

const chartData = computed(() => ({
  labels: hourlyVolume.value.map((entry) => formatHourLabel(entry.hour)),
  datasets: [
    {
      label: t("hourlyVolume.orders"),
      data: hourlyVolume.value.map((entry) => entry.orderCount),
      // Single series, so it takes the brand colour (tailwind.config.ts).
      backgroundColor: "#6f4e37",
      borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
      maxBarThickness: 24,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#898781" },
    },
    y: {
      beginAtZero: true,
      ticks: { color: "#898781", precision: isAverage.value ? 1 : 0 },
      grid: { color: "#e1e0d9" },
      border: { display: false },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(context: TooltipItem<"bar">) {
          const entry = hourlyVolume.value[context.dataIndex];
          const orderCount = context.parsed.y ?? 0;
          const orders = isAverage.value
            ? t("hourlyVolume.averageOrders", { count: formatOrders(orderCount) })
            : t("hourlyVolume.orderCount", orderCount);
          return ` ${orders} – ${formatMain(entry?.revenue ?? 0)}`;
        },
      },
    },
  },
}));
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">
        {{ isAverage ? $t("hourlyVolume.averageHeading") : $t("hourlyVolume.heading") }}
      </h3>
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
      {{ $t("hourlyVolume.noData") }}
    </p>

    <div v-else-if="showTable" class="max-h-64 overflow-y-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-slate-500">
            <th class="py-2 font-medium">{{ $t("hourlyVolume.hour") }}</th>
            <th class="py-2 text-right font-medium">{{ $t("hourlyVolume.orders") }}</th>
            <th class="py-2 text-right font-medium">{{ $t("hourlyVolume.revenue") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in hourlyVolume.filter((e) => e.orderCount > 0)"
            :key="entry.hour"
            class="border-b border-slate-100"
          >
            <td class="py-2 text-slate-700">{{ formatHourLabel(entry.hour) }}</td>
            <td class="py-2 text-right font-medium text-slate-900">{{ formatOrders(entry.orderCount) }}</td>
            <td class="py-2 text-right text-slate-500">
              {{ formatMain(entry.revenue) }}
              <span class="block text-xs text-slate-400">{{ formatSecondary(entry.revenue) }}</span>
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

    <p v-if="hasData && isAverage" class="mt-3 text-xs text-slate-400">{{ $t("hourlyVolume.averageNote", periodDays) }}</p>
  </div>
</template>
