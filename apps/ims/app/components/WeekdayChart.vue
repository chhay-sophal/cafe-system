<script setup lang="ts">
import { computed, ref } from "vue";
import { Chart as ChartJS, registerables, type TooltipItem } from "chart.js";
import { Bar } from "vue-chartjs";

ChartJS.register(...registerables);

const { t } = useI18n();
const store = useReportsStore();
const { formatMain, formatSecondary } = useCurrency();

const showTable = ref(false);

// Monday first, as the week is usually planned. Keys of weekdays.* in the
// locale files - Khmer names are written out, since some browsers lack
// Khmer date data (see utils/date.ts).
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface Row {
  key: (typeof WEEKDAYS)[number];
  // How many of this weekday the range has, and the averages per one.
  days: number;
  orders: number;
  revenue: number;
}

// Average per weekday, so a range holding five Mondays and four Sundays
// still compares fairly. Days without sales count, as zeros.
const rows = computed<Row[]>(() => {
  const totals = WEEKDAYS.map((key) => ({ key, days: 0, orders: 0, revenue: 0 }));
  for (const day of store.report?.dailyVolume ?? []) {
    // "YYYY-MM-DD" read as UTC, so the weekday doesn't depend on this
    // computer's time zone. getUTCDay() is 0 for Sunday.
    const index = (new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const total = totals[index]!;
    total.days += 1;
    total.orders += day.orderCount;
    total.revenue += day.revenue;
  }
  return totals.map((total) => ({
    ...total,
    orders: total.days > 0 ? total.orders / total.days : 0,
    revenue: total.days > 0 ? total.revenue / total.days : 0,
  }));
});

const hasData = computed(() => rows.value.some((row) => row.orders > 0));

function formatOrders(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

const chartData = computed(() => ({
  labels: rows.value.map((row) => t(`weekdays.${row.key}`)),
  datasets: [
    {
      label: t("weekday.revenue"),
      data: rows.value.map((row) => row.revenue),
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
  scales: {
    x: { grid: { display: false }, ticks: { color: "#898781" } },
    y: {
      beginAtZero: true,
      ticks: { color: "#898781", maxTicksLimit: 5, callback: (value: string | number) => formatMain(Number(value)) },
      grid: { color: "#e1e0d9" },
      border: { display: false },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(context: TooltipItem<"bar">) {
          const row = rows.value[context.dataIndex];
          return row ? ` ${formatMain(row.revenue)} – ${t("weekday.averageOrders", { count: formatOrders(row.orders) })}` : "";
        },
      },
    },
  },
}));
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">{{ $t("weekday.heading") }}</h3>
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

    <table v-else-if="showTable" class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left text-slate-500">
          <th class="py-2 font-medium">{{ $t("weekday.day") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("weekday.orders") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("weekday.revenue") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key" class="border-b border-slate-100">
          <td class="py-2 text-slate-700">{{ $t(`weekdays.${row.key}`) }}</td>
          <td class="py-2 text-right font-medium text-slate-900">{{ formatOrders(row.orders) }}</td>
          <td class="py-2 text-right text-slate-500">
            {{ formatMain(row.revenue) }}
            <span class="block text-xs text-slate-400">{{ formatSecondary(row.revenue) }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div
      v-else
      class="h-64 transition-opacity duration-150"
      :class="{ 'opacity-50': store.isLoading && store.hasLoadedOnce }"
      :aria-label="rows.map((row) => `${$t(`weekdays.${row.key}`)}: ${formatMain(row.revenue)}`).join(', ')"
      role="img"
    >
      <Bar :data="chartData" :options="chartOptions" />
    </div>

    <p v-if="hasData" class="mt-3 text-xs text-slate-400">{{ $t("weekday.note") }}</p>
  </div>
</template>
