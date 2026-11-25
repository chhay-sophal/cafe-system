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

type Metric = "revenue" | "quantity" | "profit";

const metric = ref<Metric>("revenue");
const showTable = ref(false);

interface Row {
  key: string;
  label: string;
  quantity: number;
  revenue: number;
  cost: number | null;
  profit: number | null;
  // Cost partly unknown (no recipe, or an ingredient with no cost) - its
  // profit is too high, so it's marked.
  costIncomplete: boolean;
  margin: number | null;
}

// Profit needs a backend that reports it.
const hasProfit = computed(() => (store.report?.topProducts ?? []).some((product) => product.profit !== undefined));

// Ranked by the chosen measure and cut to the top 10. Categories have their
// own chart (CategorySalesChart).
const rows = computed<Row[]>(() => {
  const all: Row[] = (store.report?.topProducts ?? []).map((product) => ({
    key: product.productId,
    label: product.productName,
    quantity: product.quantity,
    revenue: product.revenue,
    cost: product.cost ?? null,
    profit: product.profit ?? null,
    costIncomplete: product.costComplete === false,
    margin: product.profit !== undefined && product.revenue > 0 ? Math.round((product.profit / product.revenue) * 100) : null,
  }));
  return all.sort((a, b) => (b[metric.value] ?? 0) - (a[metric.value] ?? 0)).slice(0, MAX_ROWS);
});

const hasData = computed(() => rows.value.length > 0);
const hasIncomplete = computed(() => metric.value === "profit" && rows.value.some((row) => row.costIncomplete));
const chartHeight = computed(() => `${Math.max(rows.value.length, 3) * ROW_HEIGHT_PX + 32}px`);

function formatValue(row: Row): string {
  if (metric.value === "quantity") return t("topProducts.sold", row.quantity);
  return formatMain(metric.value === "profit" ? row.profit ?? 0 : row.revenue);
}

const METRIC_LABEL: Record<Metric, string> = {
  revenue: "topProducts.revenue",
  quantity: "topProducts.quantity",
  profit: "topProducts.profit",
};

const chartData = computed(() => ({
  // "*" marks a profit that is too high (see the note under the chart).
  labels: rows.value.map((row) => (hasIncomplete.value && row.costIncomplete ? `${row.label} *` : row.label)),
  datasets: [
    {
      label: t(METRIC_LABEL[metric.value]),
      data: rows.value.map((row) => row[metric.value] ?? 0),
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
        callback: (value: string | number) => (metric.value === "quantity" ? value : formatMain(Number(value))),
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
          if (!row) return "";
          const profit = row.profit !== null && metric.value === "profit" ? ` – ${t("topProducts.profitOf", { amount: formatMain(row.profit) })}` : "";
          return ` ${formatMain(row.revenue)} – ${t("topProducts.sold", row.quantity)}${profit}`;
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
        <div class="flex overflow-hidden rounded-lg border border-slate-300" role="group" :aria-label="$t('topProducts.rankBy')">
          <button
            v-for="option in (hasProfit ? ['revenue', 'quantity', 'profit'] : ['revenue', 'quantity']) as Metric[]"
            :key="option"
            type="button"
            :class="toggleClass(metric === option)"
            :aria-pressed="metric === option"
            @click="metric = option"
          >
            {{ $t(METRIC_LABEL[option]) }}
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

    <div v-else-if="showTable" class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-slate-500">
            <th class="py-2 font-medium">{{ $t("topProducts.product") }}</th>
            <th class="py-2 text-right font-medium">{{ $t("topProducts.quantity") }}</th>
            <th class="py-2 text-right font-medium">{{ $t("topProducts.revenue") }}</th>
            <template v-if="hasProfit">
              <th class="py-2 pl-3 text-right font-medium">{{ $t("topProducts.cost") }}</th>
              <th class="py-2 pl-3 text-right font-medium">{{ $t("topProducts.profit") }}</th>
              <th class="py-2 pl-3 text-right font-medium">{{ $t("topProducts.margin") }}</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ row.label }}<span v-if="hasProfit && row.costIncomplete"> *</span></td>
            <td class="py-2 text-right font-medium text-slate-900">{{ row.quantity }}</td>
            <td class="py-2 text-right text-slate-500">
              {{ formatMain(row.revenue) }}
              <span class="block text-xs text-slate-400">{{ formatSecondary(row.revenue) }}</span>
            </td>
            <template v-if="hasProfit">
              <td class="py-2 pl-3 text-right text-slate-500">{{ row.cost === null ? $t("common.dash") : formatMain(row.cost) }}</td>
              <td class="py-2 pl-3 text-right font-medium text-slate-900">{{ row.profit === null ? $t("common.dash") : formatMain(row.profit) }}</td>
              <td class="py-2 pl-3 text-right text-slate-500">{{ row.margin === null ? $t("common.dash") : `${row.margin}%` }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

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

    <p v-if="hasData" class="mt-3 text-xs text-slate-400">
      {{ $t("topProducts.note") }}
      <template v-if="hasProfit && (hasIncomplete || (showTable && rows.some((row) => row.costIncomplete)))">
        {{ $t("topProducts.incompleteNote") }}
      </template>
    </p>
  </div>
</template>
