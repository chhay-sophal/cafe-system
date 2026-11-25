<script setup lang="ts">
import { computed, watch } from "vue";
import type { DailySummaryMetrics } from "~/types/reports";
import type { OrderSummary } from "~/types/orders";

// What's behind a summary card on Analytics, opened by clicking the card:
// the figures it's made of for this period and the one before, and the
// sales or items behind it. Orders listed here open in the order popup.
export type SummaryCardKey = "netRevenue" | "grossProfit" | "orders" | "itemsSold" | "averageOrderValue" | "voids";

const metric = defineModel<SummaryCardKey | null>("metric", { default: null });
defineProps<{ title: string }>();

const { t, locale } = useI18n();
const store = useReportsStore();
const ordersStore = useOrdersStore();
const period = useSalesPeriodStore();
const auth = useAuth();
const { formatMain, formatSecondary } = useCurrency();

function close() {
  metric.value = null;
}
const dismiss = useDismiss(() => metric.value !== null, close);

const report = computed(() => store.report);
const current = computed(() => report.value?.metrics);
const previous = computed(() => report.value?.previousPeriod?.metrics);
const periodDays = computed(() => report.value?.dailyVolume?.length ?? 1);

function rangeText(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatDateLabel(startDate, locale.value)
    : `${formatDateLabel(startDate, locale.value)} – ${formatDateLabel(endDate, locale.value)}`;
}

// --- Orders in the period (voids, cashiers, order sizes) ------------------

// The same list Sales History shows, shared with it (stores/orders.ts) -
// loaded only for the cards that need it.
const NEEDS_ORDERS: SummaryCardKey[] = ["orders", "averageOrderValue", "voids"];
const needsOrders = computed(() => metric.value !== null && NEEDS_ORDERS.includes(metric.value));

watch(
  needsOrders,
  (needed) => {
    const token = auth.session.value?.token;
    if (needed && token) {
      ordersStore.ensureOrders(period.startDate, period.endDate, token);
    }
  },
  { immediate: true },
);

// Only once the list is the one for this period.
const periodOrders = computed<OrderSummary[] | null>(() =>
  ordersStore.loadedRange === `${period.startDate}..${period.endDate}` ? ordersStore.orders : null,
);
const completedOrders = computed(() => periodOrders.value?.filter((order) => order.status === "COMPLETED") ?? []);
const voidedOrders = computed(() => periodOrders.value?.filter((order) => order.status === "VOIDED") ?? []);
const discountedOrders = computed(() => completedOrders.value.filter((order) => order.discountAmount > 0));

function openOrder(order: OrderSummary) {
  const token = auth.session.value?.token;
  if (token) {
    ordersStore.fetchOrderDetail(order.id, token);
  }
}

// --- Figures, this period vs the one before -------------------------------

interface CompareRow {
  label: string;
  current: string;
  previous: string | null;
  strong?: boolean;
}

const money = (value: number | undefined) => formatMain(value ?? 0);
const salesAfterDiscounts = (m: DailySummaryMetrics | undefined) => (m?.grossRevenue ?? 0) - (m?.totalDiscounts ?? 0);
const itemsPerOrder = (m: DailySummaryMetrics | undefined) =>
  m && m.totalOrders > 0 && m.itemsSold !== undefined ? (m.itemsSold / m.totalOrders).toFixed(1) : t("common.dash");
const averageOrder = (m: DailySummaryMetrics | undefined) => (m && m.totalOrders > 0 ? m.netRevenue / m.totalOrders : 0);
const margin = (m: DailySummaryMetrics | undefined) => {
  const sales = salesAfterDiscounts(m);
  return m?.grossProfit !== undefined && sales > 0 ? `${Math.round((m.grossProfit / sales) * 100)}%` : t("common.dash");
};

function row(label: string, pick: (m: DailySummaryMetrics | undefined) => string, strong = false): CompareRow {
  return { label, current: pick(current.value), previous: previous.value ? pick(previous.value) : null, strong };
}

const compareRows = computed<CompareRow[]>(() => {
  switch (metric.value) {
    case "netRevenue":
      return [
        row(t("cardDetail.salesBeforeDiscounts"), (m) => money(m?.grossRevenue)),
        row(t("cardDetail.discounts"), (m) => `−${money(m?.totalDiscounts)}`),
        row(t("cardDetail.tax"), (m) => `+${money(m?.totalTax)}`),
        row(t("summaryCards.netRevenue"), (m) => money(m?.netRevenue), true),
      ];
    case "grossProfit":
      return [
        row(t("cardDetail.salesAfterDiscounts"), (m) => money(salesAfterDiscounts(m))),
        row(t("cardDetail.ingredientCost"), (m) => `−${money(m?.ingredientCost)}`),
        row(t("summaryCards.grossProfit"), (m) => money(m?.grossProfit), true),
        row(t("cardDetail.margin"), margin),
      ];
    case "orders":
      return [
        row(t("summaryCards.orders"), (m) => String(m?.totalOrders ?? 0), true),
        ...(periodDays.value > 1
          ? [row(t("cardDetail.perDay"), (m) => ((m?.totalOrders ?? 0) / periodDays.value).toFixed(1))]
          : []),
        row(t("cardDetail.itemsPerOrder"), itemsPerOrder),
      ];
    case "itemsSold":
      return [
        row(t("summaryCards.itemsSold"), (m) => String(m?.itemsSold ?? 0), true),
        row(t("cardDetail.itemsPerOrder"), itemsPerOrder),
      ];
    case "averageOrderValue":
      return [
        row(t("summaryCards.averageOrderValue"), (m) => money(averageOrder(m)), true),
        row(t("cardDetail.itemsPerOrder"), itemsPerOrder),
        row(t("summaryCards.orders"), (m) => String(m?.totalOrders ?? 0)),
      ];
    case "voids":
      return [
        row(t("cardDetail.voidedOrders"), (m) => String(m?.voidedOrders ?? 0), true),
        row(t("cardDetail.voidedAmount"), (m) => money(m?.voidedAmount)),
        row(t("cardDetail.discountsGiven"), (m) => money(m?.totalDiscounts)),
      ];
    default:
      return [];
  }
});

// --- What's behind it -----------------------------------------------------

const paymentRows = computed(() => {
  const entries = report.value?.paymentBreakdown ?? [];
  const total = entries.reduce((sum, entry) => sum + entry.totalAmount, 0);
  return entries
    .map((entry) => ({
      label: t(`paymentBreakdown.methods.${entry.method}`),
      amount: entry.totalAmount,
      share: total > 0 ? Math.round((entry.totalAmount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
});

const products = computed(() => report.value?.topProducts ?? []);
const PROFIT_LIST_SIZE = 5;
const mostProfitable = computed(() =>
  [...products.value].filter((p) => p.profit !== undefined).sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)).slice(0, PROFIT_LIST_SIZE),
);
// Only items whose cost is fully known - a missing cost would look like a
// great margin.
const lowestMargin = computed(() =>
  products.value
    .filter((p) => p.profit !== undefined && p.costComplete && p.revenue > 0)
    .map((p) => ({ ...p, margin: Math.round(((p.profit ?? 0) / p.revenue) * 100) }))
    .sort((a, b) => a.margin - b.margin)
    .slice(0, PROFIT_LIST_SIZE),
);
const costWarning = computed(() => {
  const coverage = report.value?.costCoverage;
  if (!coverage) return null;
  const parts: string[] = [];
  if (coverage.productsWithoutRecipe > 0) parts.push(t("summaryCards.noRecipe", coverage.productsWithoutRecipe));
  if (coverage.uncostedIngredients.length > 0) {
    parts.push(t("summaryCards.noCost", { names: coverage.uncostedIngredients.join(", ") }, coverage.uncostedIngredients.length));
  }
  return parts.length > 0 ? `${t("summaryCards.profitIncomplete")} ${parts.join(" ")}` : null;
});

const totalItems = computed(() => products.value.reduce((sum, p) => sum + p.quantity, 0));
const itemRows = computed(() =>
  [...products.value]
    .sort((a, b) => b.quantity - a.quantity)
    .map((p) => ({ ...p, share: totalItems.value > 0 ? Math.round((p.quantity / totalItems.value) * 100) : 0 })),
);

const cashierRows = computed(() => {
  const byCashier = new Map<string, { orders: number; revenue: number }>();
  for (const order of completedOrders.value) {
    const name = order.cashierName ?? t("common.dash");
    const entry = byCashier.get(name) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += order.totalAmount;
    byCashier.set(name, entry);
  }
  return [...byCashier].map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.revenue - a.revenue);
});

const busiestDay = computed(() => {
  const days = report.value?.dailyVolume ?? [];
  const best = days.reduce<(typeof days)[number] | null>((top, day) => (!top || day.orderCount > top.orderCount ? day : top), null);
  return periodDays.value > 1 && best && best.orderCount > 0 ? best : null;
});
const busiestHour = computed(() => {
  const hours = report.value?.hourlyVolume ?? [];
  const best = hours.reduce<(typeof hours)[number] | null>((top, hour) => (!top || hour.orderCount > top.orderCount ? hour : top), null);
  return best && best.orderCount > 0 ? best : null;
});

function hourLabel(hour: number): string {
  const format = (h: number) => (h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);
  return `${format(hour)}–${format((hour + 1) % 24)}`;
}

// Smallest, middle and largest sale, each opening the order.
const orderSizes = computed(() => {
  const sorted = [...completedOrders.value].sort((a, b) => a.totalAmount - b.totalAmount);
  if (sorted.length === 0) return [];
  return [
    { label: t("cardDetail.largestOrder"), order: sorted.at(-1)! },
    { label: t("cardDetail.medianOrder"), order: sorted[Math.floor((sorted.length - 1) / 2)]! },
    { label: t("cardDetail.smallestOrder"), order: sorted[0]! },
  ];
});

const SECTION = "mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400";
const ORDER_ROW = "cursor-pointer border-b border-slate-100 hover:bg-slate-50";
</script>

<template>
  <div
    v-if="metric && report"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @pointerdown="dismiss.onPointerDown"
    @click="dismiss.onClick"
  >
    <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" role="dialog" :aria-label="title">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-bold text-slate-900">{{ title }}</h2>
          <p class="text-xs text-slate-500">{{ rangeText(report.dateRange.startDate, report.dateRange.endDate) }}</p>
        </div>
        <button type="button" class="text-2xl leading-none text-slate-400 hover:text-slate-600" :aria-label="t('common.close')" @click="close">
          &times;
        </button>
      </div>

      <!-- The figures, this period and the one before -->
      <table class="mt-4 w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs text-slate-500">
            <th class="py-2 font-medium"></th>
            <th class="py-2 text-right font-medium">{{ t("cardDetail.thisPeriod") }}</th>
            <th v-if="report.previousPeriod" class="py-2 pl-4 text-right font-medium">
              {{ t("cardDetail.previousPeriod") }}
              <span class="block font-normal text-slate-400">
                {{ rangeText(report.previousPeriod.startDate, report.previousPeriod.endDate) }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in compareRows" :key="item.label" class="border-b border-slate-100">
            <td class="py-2" :class="item.strong ? 'font-semibold text-slate-900' : 'text-slate-600'">{{ item.label }}</td>
            <td class="py-2 text-right" :class="item.strong ? 'font-semibold text-slate-900' : 'text-slate-700'">{{ item.current }}</td>
            <td v-if="report.previousPeriod" class="py-2 pl-4 text-right text-slate-400">{{ item.previous ?? t("common.dash") }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Net revenue: how it was paid -->
      <template v-if="metric === 'netRevenue' && paymentRows.length > 0">
        <h3 :class="SECTION">{{ t("paymentBreakdown.heading") }}</h3>
        <table class="mt-2 w-full text-sm">
          <tbody>
            <tr v-for="entry in paymentRows" :key="entry.label" class="border-b border-slate-100">
              <td class="py-2 text-slate-700">{{ entry.label }}</td>
              <td class="py-2 text-right text-slate-900">
                {{ formatMain(entry.amount) }}
                <span class="block text-xs text-slate-400">{{ formatSecondary(entry.amount) }}</span>
              </td>
              <td class="w-16 py-2 text-right text-slate-500">{{ entry.share }}%</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-slate-400">{{ t("paymentBreakdown.collectedNote") }}</p>
      </template>

      <!-- Gross profit: best and weakest items -->
      <template v-if="metric === 'grossProfit'">
        <p v-if="costWarning" class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{{ costWarning }}</p>
        <template v-if="mostProfitable.length > 0">
          <h3 :class="SECTION">{{ t("cardDetail.mostProfitable") }}</h3>
          <table class="mt-2 w-full text-sm">
            <tbody>
              <tr v-for="product in mostProfitable" :key="product.productId" class="border-b border-slate-100">
                <td class="py-2 text-slate-700">{{ product.productName }}<span v-if="product.costComplete === false"> *</span></td>
                <td class="py-2 text-right font-medium text-slate-900">{{ formatMain(product.profit ?? 0) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
        <template v-if="lowestMargin.length > 0">
          <h3 :class="SECTION">{{ t("cardDetail.lowestMargin") }}</h3>
          <table class="mt-2 w-full text-sm">
            <tbody>
              <tr v-for="product in lowestMargin" :key="product.productId" class="border-b border-slate-100">
                <td class="py-2 text-slate-700">{{ product.productName }}</td>
                <td class="py-2 text-right text-slate-500">{{ formatMain(product.profit ?? 0) }}</td>
                <td class="w-16 py-2 text-right font-medium text-slate-900">{{ product.margin }}%</td>
              </tr>
            </tbody>
          </table>
        </template>
        <p v-if="mostProfitable.some((p) => p.costComplete === false)" class="mt-2 text-xs text-slate-400">
          {{ t("topProducts.incompleteNote") }}
        </p>
      </template>

      <!-- Items sold: every item -->
      <template v-if="metric === 'itemsSold' && itemRows.length > 0">
        <h3 :class="SECTION">{{ t("cardDetail.allItems") }}</h3>
        <table class="mt-2 w-full text-sm">
          <tbody>
            <tr v-for="product in itemRows" :key="product.productId" class="border-b border-slate-100">
              <td class="py-2 text-slate-700">{{ product.productName }}</td>
              <td class="py-2 text-right font-medium text-slate-900">{{ product.quantity }}</td>
              <td class="w-16 py-2 text-right text-slate-500">{{ product.share }}%</td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Sections built from the period's orders -->
      <template v-if="needsOrders">
        <p v-if="ordersStore.error" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ ordersStore.error }}</p>
        <p v-else-if="!periodOrders" class="mt-6 text-center text-sm text-slate-400">{{ t("orders.loading") }}</p>

        <template v-else-if="metric === 'orders'">
          <dl v-if="busiestDay || busiestHour" class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div v-if="busiestDay" class="rounded-lg bg-slate-50 p-3">
              <dt class="text-xs text-slate-500">{{ t("cardDetail.busiestDay") }}</dt>
              <dd class="font-semibold text-slate-900">{{ formatDateLabel(busiestDay.date, locale) }}</dd>
              <dd class="text-xs text-slate-500">{{ t("hourlyVolume.orderCount", busiestDay.orderCount) }}</dd>
            </div>
            <div v-if="busiestHour" class="rounded-lg bg-slate-50 p-3">
              <dt class="text-xs text-slate-500">{{ t("cardDetail.busiestHour") }}</dt>
              <dd class="font-semibold text-slate-900">{{ hourLabel(busiestHour.hour) }}</dd>
              <dd class="text-xs text-slate-500">{{ t("hourlyVolume.orderCount", busiestHour.orderCount) }}</dd>
            </div>
          </dl>
          <template v-if="cashierRows.length > 0">
            <h3 :class="SECTION">{{ t("cardDetail.byCashier") }}</h3>
            <table class="mt-2 w-full text-sm">
              <tbody>
                <tr v-for="cashier in cashierRows" :key="cashier.name" class="border-b border-slate-100">
                  <td class="py-2 text-slate-700">{{ cashier.name }}</td>
                  <td class="py-2 text-right text-slate-500">{{ t("hourlyVolume.orderCount", cashier.orders) }}</td>
                  <td class="py-2 text-right font-medium text-slate-900">{{ formatMain(cashier.revenue) }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </template>

        <template v-else-if="metric === 'averageOrderValue' && orderSizes.length > 0">
          <h3 :class="SECTION">{{ t("cardDetail.orderSizes") }}</h3>
          <table class="mt-2 w-full text-sm">
            <tbody>
              <tr v-for="size in orderSizes" :key="size.label" :class="ORDER_ROW" @click="openOrder(size.order)">
                <td class="py-2 text-slate-600">{{ size.label }}</td>
                <td class="py-2 text-slate-700">#{{ size.order.orderNumber }}</td>
                <td class="py-2 text-right text-slate-500">{{ t("cardDetail.itemCount", size.order.itemCount) }}</td>
                <td class="py-2 text-right font-medium text-slate-900">{{ formatMain(size.order.totalAmount) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-xs text-slate-400">{{ t("cardDetail.openOrderHint") }}</p>
        </template>

        <template v-else-if="metric === 'voids'">
          <h3 :class="SECTION">{{ t("cardDetail.voidedOrders") }} ({{ voidedOrders.length }})</h3>
          <p v-if="voidedOrders.length === 0" class="mt-2 text-sm text-slate-400">{{ t("cardDetail.noVoids") }}</p>
          <table v-else class="mt-2 w-full text-sm">
            <tbody>
              <tr v-for="order in voidedOrders" :key="order.id" :class="ORDER_ROW" @click="openOrder(order)">
                <td class="py-2 font-medium text-slate-700">#{{ order.orderNumber }}</td>
                <td class="py-2 text-slate-500">{{ formatDateTime(order.createdAt, locale) }}</td>
                <td class="py-2 text-slate-500">{{ order.cashierName ?? t("common.dash") }}</td>
                <td class="py-2 text-right font-medium text-slate-900">{{ formatMain(order.totalAmount) }}</td>
              </tr>
            </tbody>
          </table>

          <h3 :class="SECTION">{{ t("cardDetail.discountedOrders") }} ({{ discountedOrders.length }})</h3>
          <p v-if="discountedOrders.length === 0" class="mt-2 text-sm text-slate-400">{{ t("cardDetail.noDiscounts") }}</p>
          <table v-else class="mt-2 w-full text-sm">
            <tbody>
              <tr v-for="order in discountedOrders" :key="order.id" :class="ORDER_ROW" @click="openOrder(order)">
                <td class="py-2 font-medium text-slate-700">#{{ order.orderNumber }}</td>
                <td class="py-2 text-slate-500">{{ formatDateTime(order.createdAt, locale) }}</td>
                <td class="py-2 text-slate-500">{{ order.cashierName ?? t("common.dash") }}</td>
                <td class="py-2 text-right font-medium text-slate-900">−{{ formatMain(order.discountAmount) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="voidedOrders.length + discountedOrders.length > 0" class="mt-2 text-xs text-slate-400">
            {{ t("cardDetail.openOrderHint") }}
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
