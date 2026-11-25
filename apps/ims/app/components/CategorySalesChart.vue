<script setup lang="ts">
import { computed, ref } from "vue";
import { Chart as ChartJS, registerables, type TooltipItem } from "chart.js";
import { Bar } from "vue-chartjs";

ChartJS.register(...registerables);

const { t } = useI18n();
const store = useReportsStore();
const { formatMain, formatSecondary } = useCurrency();

const ROW_HEIGHT_PX = 32;
const showTable = ref(false);

interface Row {
  label: string;
  quantity: number;
  revenue: number;
  // Of all item revenue in the period, rounded.
  share: number;
}

// Item revenue (add-ons included, before order discounts) summed per
// category, largest first - every category, so the shares add up.
const rows = computed<Row[]>(() => {
  const byCategory = new Map<string, { quantity: number; revenue: number }>();
  for (const product of store.report?.topProducts ?? []) {
    const label = product.categoryName ?? t("topProducts.uncategorized");
    const row = byCategory.get(label) ?? { quantity: 0, revenue: 0 };
    row.quantity += product.quantity;
    row.revenue += product.revenue;
    byCategory.set(label, row);
  }
  const total = [...byCategory.values()].reduce((sum, row) => sum + row.revenue, 0);
  return [...byCategory]
    .map(([label, row]) => ({ label, ...row, share: total > 0 ? Math.round((row.revenue / total) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
});

const hasData = computed(() => rows.value.length > 0);
const chartHeight = computed(() => `${Math.max(rows.value.length, 3) * ROW_HEIGHT_PX + 32}px`);

const chartData = computed(() => ({
  labels: rows.value.map((row) => row.label),
  datasets: [
    {
      label: t("categorySales.revenue"),
      data: rows.value.map((row) => row.revenue),
      // Single series, so it takes the brand colour (tailwind.config.ts).
      backgroundColor: "#6f4e37",
      borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 },
      maxBarThickness: 20,
    },
  ],
}));

const chartOptions = computed(() => ({
  indexAxis: "y" as const,
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      beginAtZero: true,
      ticks: { color: "#898781", maxTicksLimit: 5, callback: (value: string | number) => formatMain(Number(value)) },
      grid: { color: "#e1e0d9" },
      border: { display: false },
    },
    y: { grid: { display: false }, ticks: { color: "#52514e" } },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(context: TooltipItem<"bar">) {
          const row = rows.value[context.dataIndex];
          return row ? ` ${formatMain(row.revenue)} (${row.share}%) – ${t("topProducts.sold", row.quantity)}` : "";
        },
      },
    },
  },
}));
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">{{ $t("categorySales.heading") }}</h3>
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
      {{ $t("topProducts.noData") }}
    </p>

    <table v-else-if="showTable" class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left text-slate-500">
          <th class="py-2 font-medium">{{ $t("topProducts.category") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("topProducts.quantity") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("categorySales.revenue") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("categorySales.share") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label" class="border-b border-slate-100">
          <td class="py-2 text-slate-700">{{ row.label }}</td>
          <td class="py-2 text-right font-medium text-slate-900">{{ row.quantity }}</td>
          <td class="py-2 text-right text-slate-500">
            {{ formatMain(row.revenue) }}
            <span class="block text-xs text-slate-400">{{ formatSecondary(row.revenue) }}</span>
          </td>
          <td class="py-2 text-right text-slate-700">{{ row.share }}%</td>
        </tr>
      </tbody>
    </table>

    <div
      v-else
      class="transition-opacity duration-150"
      :style="{ height: chartHeight }"
      :class="{ 'opacity-50': store.isLoading && store.hasLoadedOnce }"
      :aria-label="rows.map((row) => `${row.label}: ${formatMain(row.revenue)} (${row.share}%)`).join(', ')"
      role="img"
    >
      <Bar :data="chartData" :options="chartOptions" />
    </div>

    <p v-if="hasData" class="mt-3 text-xs text-slate-400">{{ $t("categorySales.note") }}</p>
  </div>
</template>
