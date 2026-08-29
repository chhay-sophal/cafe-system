<script setup lang="ts">
import { computed, ref } from "vue";
import { Chart as ChartJS, registerables, type TooltipItem } from "chart.js";
import { Pie } from "vue-chartjs";

ChartJS.register(...registerables);

const { t } = useI18n();
const store = useReportsStore();

// Categorical slots 1-3 from the validated default palette (blue/green/magenta) -
// see the dataviz skill's palette.md. Passes all-pairs CVD + normal-vision checks
// for up to 4 slots; the light-mode magenta sits under 3:1 contrast, which is why
// this chart always ships a legend + table-view twin (the required "relief").
const SERIES_COLORS = ["#2a78d6", "#008300", "#e87ba4"];

const showTable = ref(false);

const breakdown = computed(() => store.report?.paymentBreakdown ?? []);
const hasData = computed(() => breakdown.value.some((entry) => entry.totalAmount > 0));
const total = computed(() => breakdown.value.reduce((sum, entry) => sum + entry.totalAmount, 0));

const { formatMain, formatSecondary } = useCurrency();

function labelFor(method: string): string {
  const key = `paymentBreakdown.methods.${method}`;
  return t(key) !== key ? t(key) : method;
}

function shareOf(amount: number): string {
  return total.value > 0 ? `${((amount / total.value) * 100).toFixed(1)}%` : "0.0%";
}

const chartData = computed(() => ({
  labels: breakdown.value.map((entry) => labelFor(entry.method)),
  datasets: [
    {
      data: breakdown.value.map((entry) => entry.totalAmount),
      backgroundColor: breakdown.value.map((_, index) => SERIES_COLORS[index % SERIES_COLORS.length]),
      borderColor: "#fcfcfb",
      borderWidth: 2,
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { color: "#52514e", usePointStyle: true, padding: 16 },
    },
    tooltip: {
      callbacks: {
        // Value leads, label follows - the reader already has the series.
        label(context: TooltipItem<"pie">) {
          const value = context.parsed;
          return ` ${formatMain(value)} (${shareOf(value)}) – ${context.label}`;
        },
      },
    },
  },
};
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">{{ $t("paymentBreakdown.heading") }}</h3>
      <button
        v-if="hasData"
        type="button"
        class="text-xs font-semibold text-slate-500 hover:text-slate-700"
        @click="showTable = !showTable"
      >
        {{ showTable ? $t("common.viewChart") : $t("common.viewTable") }}
      </button>
    </div>

    <p v-if="!hasData" class="flex h-56 items-center justify-center text-center text-sm text-slate-400">
      {{ $t("paymentBreakdown.noData") }}
    </p>

    <table v-else-if="showTable" class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left text-slate-500">
          <th class="py-2 font-medium">{{ $t("paymentBreakdown.method") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("paymentBreakdown.amount") }}</th>
          <th class="py-2 text-right font-medium">{{ $t("paymentBreakdown.share") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(entry, index) in breakdown" :key="entry.method" class="border-b border-slate-100">
          <td class="py-2 text-slate-700">
            <span
              class="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
              :style="{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }"
            />
            {{ labelFor(entry.method) }}
          </td>
          <td class="py-2 text-right font-medium text-slate-900">
            {{ formatMain(entry.totalAmount) }}
            <span class="block text-xs font-normal text-slate-400">{{ formatSecondary(entry.totalAmount) }}</span>
          </td>
          <td class="py-2 text-right text-slate-500">{{ shareOf(entry.totalAmount) }}</td>
        </tr>
      </tbody>
    </table>

    <div
      v-else
      class="mx-auto h-64 max-w-xs transition-opacity duration-150"
      :class="{ 'opacity-50': store.isLoading && store.hasLoadedOnce }"
    >
      <Pie :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
