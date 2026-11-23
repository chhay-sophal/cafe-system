<script setup lang="ts">
import { computed, ref } from "vue";
import { Chart as ChartJS, registerables, type TooltipItem } from "chart.js";
import { Bar } from "vue-chartjs";

ChartJS.register(...registerables);

const { t } = useI18n();
const store = useReportsStore();
const { formatMain, formatSecondary } = useCurrency();

const MAX_ROWS = 10;
const ROW_HEIGHT_PX = 32;

type Metric = "revenue" | "quantity";
type Grouping = "product" | "category";

const metric = ref<Metric>("revenue");
const grouping = ref<Grouping>("product");
const showTable = ref(false);

interface Row {
  key: string;
  label: string;
  quantity: number;
  revenue: number;
}

// Products as reported, or summed per category - then ranked by the chosen
// measure and cut to the top 10.
const rows = computed<Row[]>(() => {
  const products = store.report?.topProducts ?? [];
  let all: Row[];
  if (grouping.value === "product") {
    all = products.map((product) => ({
      key: product.productId,
      label: product.productName,
      quantity: product.quantity,
      revenue: product.revenue,
    }));
  } else {
    const byCategory = new Map<string, Row>();
    for (const product of products) {
      const label = product.categoryName ?? t("topProducts.uncategorized");
      const row = byCategory.get(label) ?? { key: label, label, quantity: 0, revenue: 0 };
      row.quantity += product.quantity;
      row.revenue += product.revenue;
      byCategory.set(label, row);
    }
    all = [...byCategory.values()];
  }
  return all.sort((a, b) => b[metric.value] - a[metric.value]).slice(0, MAX_ROWS);
});

const hasData = computed(() => rows.value.length > 0);
const chartHeight = computed(() => `${Math.max(rows.value.length, 3) * ROW_HEIGHT_PX + 32}px`);

function formatValue(row: Row): string {
  return metric.value === "revenue" ? formatMain(row.revenue) : t("topProducts.sold", row.quantity);
}

const chartData = computed(() => ({
  labels: rows.value.map((row) => row.label),
  datasets: [
    {
      label: metric.value === "revenue" ? t("topProducts.revenue") : t("topProducts.quantity"),
      data: rows.value.map((row) => row[metric.value]),
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
      ticks: {
        color: "#898781",
        maxTicksLimit: 5,
        precision: 0,
        callback: (value: string | number) => (metric.value === "revenue" ? formatMain(Number(value)) : value),
      },
      grid: { color: "#e1e0d9" },
      border: { display: false },
    },
    y: {
      grid: { display: false },
      ticks: { color: "#52514e" },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(context: TooltipItem<"bar">) {
          const row = rows.value[context.dataIndex];
          return row ? ` ${formatMain(row.revenue)} – ${t("topProducts.sold", row.quantity)}` : "";
        },
      },
    },
  },
}));

const toggleClass = (active: boolean) => [
  "px-2.5 py-1 text-xs font-semibold transition",
  active ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50",
];
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-slate-700">{{ $t("topProducts.heading") }}</h3>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex overflow-hidden rounded-lg border border-slate-300" role="group" :aria-label="$t('topProducts.groupBy')">
          <button type="button" :class="toggleClass(grouping === 'product')" :aria-pressed="grouping === 'product'" @click="grouping = 'product'">
            {{ $t("topProducts.products") }}
          </button>
          <button type="button" :class="toggleClass(grouping === 'category')" :aria-pressed="grouping === 'category'" @click="grouping = 'category'">
            {{ $t("topProducts.categories") }}
          </button>
        </div>
        <div class="flex overflow-hidden rounded-lg border border-slate-300" role="group" :aria-label="$t('topProducts.rankBy')">
          <button type="button" :class="toggleClass(metric === 'revenue')" :aria-pressed="metric === 'revenue'" @click="metric = 'revenue'">
            {{ $t("topProducts.revenue") }}
          </button>
          <button type="button" :class="toggleClass(metric === 'quantity')" :aria-pressed="metric === 'quantity'" @click="metric = 'quantity'">
            {{ $t("topProducts.quantity") }}
          </button>
        </div>
        <button
          v-if="hasData"
          type="button"
          class="text-xs font-semibold text-slate-500 hover:text-slate-700"
          @click="showTable = !showTable"
        >
          {{ showTable ? $t("common.viewChart") : $t("common.viewTable") }}
        </button>
      </div>
    </div>

    <p v-if="!hasData" class="flex h-64 items-center justify-center text-center text-sm text-slate-400">
      {{ $t("topProducts.noData") }}
    </p>

    <table v-else-if="showTable" class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left text-slate-500">
          <th class="py-2 font-medium">{{ grouping === "product" ? $t("topProducts.product") : $t("topProducts.category") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("topProducts.quantity") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("topProducts.revenue") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key" class="border-b border-slate-100">
          <td class="py-2 text-slate-700">{{ row.label }}</td>
          <td class="py-2 text-right font-medium text-slate-900">{{ row.quantity }}</td>
          <td class="py-2 text-right text-slate-500">
            {{ formatMain(row.revenue) }}
            <span class="block text-xs text-slate-400">{{ formatSecondary(row.revenue) }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div
      v-else
      class="transition-opacity duration-150"
      :style="{ height: chartHeight }"
      :class="{ 'opacity-50': store.isLoading && store.hasLoadedOnce }"
      :aria-label="rows.map((row) => `${row.label}: ${formatValue(row)}`).join(', ')"
      role="img"
    >
      <Bar :data="chartData" :options="chartOptions" />
    </div>

    <p v-if="hasData" class="mt-3 text-xs text-slate-400">{{ $t("topProducts.note") }}</p>
  </div>
</template>
