<script setup lang="ts">
import { computed } from "vue";
import type { DailySummaryMetrics } from "~/types/reports";

const { t } = useI18n();
const store = useReportsStore();
const { formatMain, formatSecondary } = useCurrency();

function averageOrderValue(metrics: DailySummaryMetrics | undefined): number {
  const orders = metrics?.totalOrders ?? 0;
  return orders > 0 ? (metrics?.netRevenue ?? 0) / orders : 0;
}

// Change against the same number of days just before the picked range.
// Nothing to compare with (no sales then) shows no change line at all,
// rather than a meaningless "+∞%".
function changeFrom(current: number, previous: number): { direction: "up" | "down" | "flat"; text: string } | null {
  if (previous <= 0) {
    return null;
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  return { direction, text: `${percent > 0 ? "+" : ""}${percent}%` };
}

const periodDays = computed(() => store.report?.dailyVolume?.length ?? 1);

function marginOf(metrics: DailySummaryMetrics | undefined): number | null {
  const sales = (metrics?.grossRevenue ?? 0) - (metrics?.totalDiscounts ?? 0);
  return metrics?.grossProfit !== undefined && sales > 0 ? Math.round((metrics.grossProfit / sales) * 100) : null;
}

interface Card {
  label: string;
  value: string;
  subValue: string | null;
  change: ReturnType<typeof changeFrom>;
}

const cards = computed<Card[]>(() => {
  const current = store.report?.metrics;
  // Optional-chained: a backend from before this field just shows no change line.
  const previous = store.report?.previousPeriod?.metrics;
  const money = (value: number) => ({ value: formatMain(value), subValue: formatSecondary(value) });
  const margin = marginOf(current);

  const list: Card[] = [
    {
      // What customers paid, after discounts - the money that came in.
      label: t("summaryCards.netRevenue"),
      ...money(current?.netRevenue ?? 0),
      change: changeFrom(current?.netRevenue ?? 0, previous?.netRevenue ?? 0),
    },
  ];
  if (current?.grossProfit !== undefined) {
    list.push({
      label: t("summaryCards.grossProfit"),
      value: formatMain(current.grossProfit),
      subValue: margin === null ? null : t("summaryCards.margin", { percent: margin }),
      change: changeFrom(current.grossProfit, previous?.grossProfit ?? 0),
    });
  }
  list.push(
    {
      label: t("summaryCards.orders"),
      value: String(current?.totalOrders ?? 0),
      subValue: null,
      change: changeFrom(current?.totalOrders ?? 0, previous?.totalOrders ?? 0),
    },
  );
  if (current?.itemsSold !== undefined) {
    list.push({
      label: t("summaryCards.itemsSold"),
      value: String(current.itemsSold),
      subValue: null,
      change: changeFrom(current.itemsSold, previous?.itemsSold ?? 0),
    });
  }
  list.push({
    label: t("summaryCards.averageOrderValue"),
    ...money(averageOrderValue(current)),
    change: changeFrom(averageOrderValue(current), averageOrderValue(previous)),
  });
  if (current?.voidedOrders !== undefined) {
    // Money taken and given back, and given away - no "vs previous" arrow,
    // since up is bad here and the colours would say the opposite.
    list.push({
      label: t("summaryCards.voidsAndDiscounts"),
      value: t("summaryCards.voids", current.voidedOrders),
      subValue: t("summaryCards.voidsDetail", {
        voided: formatMain(current.voidedAmount ?? 0),
        discounts: formatMain(current.totalDiscounts),
      }),
      change: null,
    });
  }
  return list;
});

// Profit counts these as free, so it reads too high - say what to fill in.
const costWarning = computed(() => {
  const coverage = store.report?.costCoverage;
  if (!coverage) return null;
  const parts: string[] = [];
  if (coverage.productsWithoutRecipe > 0) {
    parts.push(t("summaryCards.noRecipe", coverage.productsWithoutRecipe));
  }
  if (coverage.uncostedIngredients.length > 0) {
    parts.push(t("summaryCards.noCost", { names: coverage.uncostedIngredients.join(", ") }, coverage.uncostedIngredients.length));
  }
  return parts.length > 0 ? parts.join(" ") : null;
});

// Arrow plus sign plus text, so the direction never rests on colour alone.
const CHANGE_STYLE = {
  up: { arrow: "▲", class: "text-emerald-700" },
  down: { arrow: "▼", class: "text-red-700" },
  flat: { arrow: "▬", class: "text-slate-500" },
};
</script>

<template>
  <div>
    <div
      class="grid grid-cols-1 gap-4 transition-opacity duration-150 sm:grid-cols-2 lg:grid-cols-3"
      :class="{ 'opacity-50': store.isLoading && store.hasLoadedOnce }"
    >
      <div v-for="card in cards" :key="card.label" class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="text-sm text-slate-500">{{ card.label }}</p>
        <p class="mt-1 text-2xl font-semibold text-slate-900">{{ card.value }}</p>
        <p v-if="card.subValue" class="mt-0.5 text-xs text-slate-400">{{ card.subValue }}</p>
        <p v-if="card.change" class="mt-2 text-xs">
          <span class="font-semibold" :class="CHANGE_STYLE[card.change.direction].class">
            <span aria-hidden="true">{{ CHANGE_STYLE[card.change.direction].arrow }}</span>
            {{ card.change.text }}
          </span>
          <span class="ml-1 text-slate-400">{{ t("summaryCards.vsPrevious", periodDays) }}</span>
        </p>
      </div>
    </div>
    <p v-if="costWarning" class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {{ t("summaryCards.profitIncomplete") }} {{ costWarning }}
    </p>
  </div>
</template>
