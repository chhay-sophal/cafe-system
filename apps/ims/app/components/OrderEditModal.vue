<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Minus, Plus, Trash2 } from "@lucide/vue";
import type { ModifierGroup } from "~/types/catalog";
import type { OrderDetail, PaymentMethod } from "~/types/orders";

// Correcting a completed sale: its lines, payment method and discount, with
// a reason. The backend recalculates and stores the totals; the preview here
// uses the same rules so what you see is what gets saved.

const props = defineProps<{
  order: OrderDetail;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const ordersStore = useOrdersStore();
const catalogStore = useCatalogStore();
const { formatMain, formatSecondary, formatUsd } = useCurrency();

interface EditLine {
  key: string;
  productId: string;
  productName: string;
  // Lines already on the order keep the price they sold at; added lines use
  // today's menu price.
  unitPrice: number;
  quantity: number;
  modifiers: Array<{ id: string; name: string; priceExtra: number }>;
}

const lines = ref<EditLine[]>(
  props.order.items.map((item) => ({
    key: item.id,
    productId: item.productId,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    modifiers: item.modifiers.map((modifier) => ({ id: modifier.modifierId, name: modifier.modifierName, priceExtra: modifier.priceExtra })),
  })),
);
const paymentMethod = ref<PaymentMethod>(props.order.payment?.paymentMethod ?? "CASH");
const discountText = ref(props.order.discountAmount > 0 ? String(props.order.discountAmount) : "");
const reason = ref("");
const isSaving = ref(false);
const saveError = ref<string | null>(null);

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "QR_CODE"];

onMounted(() => {
  if (!catalogStore.hasLoadedOnce) {
    catalogStore.fetchCatalog();
  }
});

function lineTotal(line: EditLine): number {
  return (line.unitPrice + line.modifiers.reduce((sum, modifier) => sum + modifier.priceExtra, 0)) * line.quantity;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const discount = computed(() => {
  const value = Number(discountText.value);
  return discountText.value.trim() === "" ? 0 : Number.isFinite(value) ? value : NaN;
});
const subtotal = computed(() => round2(lines.value.reduce((sum, line) => sum + lineTotal(line), 0)));
// Same as the backend: the tax rate the sale was charged, on the new subtotal.
const taxRate = computed(() => (props.order.taxAmount > 0 && props.order.subtotal > 0 ? props.order.taxAmount / props.order.subtotal : 0));
const tax = computed(() => round2(subtotal.value * taxRate.value));
const total = computed(() => round2(subtotal.value + tax.value - (Number.isFinite(discount.value) ? discount.value : 0)));

const formError = computed(() => {
  if (lines.value.length === 0) return t("orders.edit.needsItem");
  if (!Number.isFinite(discount.value) || discount.value < 0) return t("orders.edit.discountInvalid");
  if (discount.value > subtotal.value) return t("orders.edit.discountTooHigh");
  return null;
});
const canSave = computed(() => !formError.value && reason.value.trim() !== "" && !isSaving.value);

function changeQuantity(line: EditLine, delta: number) {
  line.quantity = Math.max(1, line.quantity + delta);
}

function removeLine(key: string) {
  lines.value = lines.value.filter((line) => line.key !== key);
}

// --- Adding an item -------------------------------------------------------

const newProductId = ref("");
const newQuantity = ref<number | string>(1);
// Chosen option ids per modifier group.
const newSelections = ref<Record<string, string[]>>({});

const availableProducts = computed(() =>
  [...catalogStore.products].filter((product) => product.isAvailable).sort((a, b) => a.name.localeCompare(b.name)),
);
const newProduct = computed(() => catalogStore.products.find((product) => product.id === newProductId.value) ?? null);
const newProductGroups = computed<ModifierGroup[]>(() =>
  catalogStore.modifierGroups.filter((group) => group.productIds.includes(newProductId.value)),
);

watch(newProductId, () => {
  newSelections.value = {};
  newQuantity.value = 1;
});

function isSingleChoice(group: ModifierGroup): boolean {
  return (group.maxSelection ?? 1) === 1;
}

function toggleOption(group: ModifierGroup, optionId: string) {
  const current = newSelections.value[group.id] ?? [];
  if (isSingleChoice(group)) {
    newSelections.value = { ...newSelections.value, [group.id]: current[0] === optionId ? [] : [optionId] };
    return;
  }
  const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
  if (next.length <= (group.maxSelection ?? Infinity)) {
    newSelections.value = { ...newSelections.value, [group.id]: next };
  }
}

// Same rule the POS applies when ringing it up: each group's minimum choices.
const missingRequiredGroup = computed(() =>
  newProductGroups.value.find((group) => (newSelections.value[group.id]?.length ?? 0) < (group.minSelection ?? 0)) ?? null,
);
const newQuantityValue = computed(() => Math.floor(Number(newQuantity.value)));
const canAddItem = computed(() => newProduct.value !== null && newQuantityValue.value >= 1 && !missingRequiredGroup.value);

function addItem() {
  if (!newProduct.value || !canAddItem.value) {
    return;
  }
  const chosen = newProductGroups.value.flatMap((group) =>
    group.options.filter((option) => newSelections.value[group.id]?.includes(option.id)),
  );
  lines.value.push({
    key: `new-${crypto.randomUUID()}`,
    productId: newProduct.value.id,
    productName: newProduct.value.name,
    unitPrice: newProduct.value.basePrice,
    quantity: newQuantityValue.value,
    modifiers: chosen.map((option) => ({ id: option.id, name: option.name, priceExtra: option.priceExtra })),
  });
  newProductId.value = "";
}

// --- Saving ---------------------------------------------------------------

async function save() {
  if (!canSave.value) {
    return;
  }
  isSaving.value = true;
  saveError.value = null;
  try {
    await ordersStore.updateOrder(props.order.id, {
      items: lines.value.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        selectedModifiers: line.modifiers,
      })),
      paymentMethod: paymentMethod.value,
      discountAmount: discount.value,
      reason: reason.value.trim(),
    });
    emit("close");
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : t("orders.edit.error");
  } finally {
    isSaving.value = false;
  }
}

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

// Closes on a click outside it or Escape (see useDismiss).
const dismiss = useDismiss(() => true, () => emit("close"), () => isSaving.value);
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" @pointerdown="dismiss.onPointerDown" @click="dismiss.onClick">
    <div
      class="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      :aria-label="t('orders.edit.heading', { number: order.orderNumber })"
    >
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 class="text-lg font-bold text-slate-900">{{ t("orders.edit.heading", { number: order.orderNumber }) }}</h2>
        <button type="button" class="text-2xl leading-none text-slate-400 hover:text-slate-600" :aria-label="t('common.close')" @click="emit('close')">
          &times;
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <!-- Lines -->
        <section>
          <h3 class="text-sm font-semibold text-slate-700">{{ t("orders.edit.items") }}</h3>
          <p v-if="lines.length === 0" class="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{{ t("orders.edit.needsItem") }}</p>
          <ul v-else class="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            <li v-for="line in lines" :key="line.key" class="flex items-center gap-3 p-3">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-slate-800">{{ line.productName }}</p>
                <p v-if="line.modifiers.length" class="truncate text-xs text-slate-500">
                  {{ line.modifiers.map((modifier) => modifier.name).join(", ") }}
                </p>
                <p class="text-xs text-slate-400">{{ formatMain(lineTotal(line) / line.quantity) }} {{ t("orders.edit.each") }}</p>
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  :disabled="line.quantity <= 1"
                  :aria-label="t('orders.edit.decrease', { name: line.productName })"
                  @click="changeQuantity(line, -1)"
                >
                  <Minus class="h-4 w-4" aria-hidden="true" />
                </button>
                <span class="w-8 text-center tabular-nums">{{ line.quantity }}</span>
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                  :aria-label="t('orders.edit.increase', { name: line.productName })"
                  @click="changeQuantity(line, 1)"
                >
                  <Plus class="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <span class="w-24 text-right text-sm text-slate-700">{{ formatMain(lineTotal(line)) }}</span>
              <button
                type="button"
                class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                :aria-label="t('orders.edit.remove', { name: line.productName })"
                :title="t('orders.edit.remove', { name: line.productName })"
                @click="removeLine(line.key)"
              >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Add an item -->
        <section class="rounded-lg border border-dashed border-slate-300 p-3">
          <h3 class="text-sm font-semibold text-slate-700">{{ t("orders.edit.addItem") }}</h3>
          <p v-if="catalogStore.error" class="mt-2 text-xs font-medium text-red-700">{{ catalogStore.error }}</p>
          <div class="mt-2 flex gap-2">
            <select v-model="newProductId" :class="INPUT_CLASS" :aria-label="t('orders.edit.chooseProduct')">
              <option value="">{{ catalogStore.isLoading ? t("orders.edit.loadingMenu") : t("orders.edit.chooseProduct") }}</option>
              <option v-for="product in availableProducts" :key="product.id" :value="product.id">
                {{ product.name }} – {{ formatMain(product.basePrice) }}
              </option>
            </select>
            <input
              v-model.number="newQuantity"
              v-numeric
              type="text"
              inputmode="numeric"
              class="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              :aria-label="t('orders.edit.quantity')"
            />
          </div>

          <div v-for="group in newProductGroups" :key="group.id" class="mt-3">
            <p class="text-xs font-semibold text-slate-600">
              {{ group.name }}
              <span class="font-normal text-slate-400">
                {{ (group.minSelection ?? 0) > 0 ? t("orders.edit.required") : t("orders.edit.optional") }}
                <template v-if="!isSingleChoice(group)"> · {{ t("orders.edit.upTo", { count: group.maxSelection }) }}</template>
              </span>
            </p>
            <div class="mt-1 flex flex-wrap gap-2">
              <button
                v-for="option in group.options"
                :key="option.id"
                type="button"
                class="rounded-full border px-3 py-1 text-xs font-medium transition"
                :class="newSelections[group.id]?.includes(option.id)
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
                :aria-pressed="newSelections[group.id]?.includes(option.id) ?? false"
                @click="toggleOption(group, option.id)"
              >
                {{ option.name }}<template v-if="option.priceExtra"> (+{{ formatMain(option.priceExtra) }})</template>
              </button>
            </div>
          </div>

          <div class="mt-3 flex items-center justify-between gap-2">
            <p v-if="missingRequiredGroup" class="text-xs text-slate-500">
              {{ t("orders.edit.chooseFrom", { name: missingRequiredGroup.name }) }}
            </p>
            <button
              type="button"
              class="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!canAddItem"
              @click="addItem"
            >
              {{ t("orders.edit.add") }}
            </button>
          </div>
        </section>

        <!-- Payment & discount -->
        <section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">{{ t("orders.columns.payment") }}</span>
            <select v-model="paymentMethod" :class="[INPUT_CLASS, 'mt-1']">
              <option v-for="method in PAYMENT_METHODS" :key="method" :value="method">{{ t(`paymentBreakdown.methods.${method}`) }}</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">{{ t("orders.edit.discountUsd") }}</span>
            <input v-model="discountText" v-numeric type="text" inputmode="decimal" placeholder="0.00" :class="[INPUT_CLASS, 'mt-1']" />
          </label>
        </section>
        <p v-if="paymentMethod === 'CASH'" class="-mt-3 text-xs text-slate-400">{{ t("orders.edit.cashNote") }}</p>

        <!-- Totals -->
        <section class="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div class="flex justify-between text-slate-600">
            <span>{{ t("orders.detail.subtotal") }}</span><span>{{ formatMain(subtotal) }}</span>
          </div>
          <div v-if="tax > 0" class="flex justify-between text-slate-600">
            <span>{{ t("orders.detail.tax") }}</span><span>{{ formatMain(tax) }}</span>
          </div>
          <div v-if="Number.isFinite(discount) && discount > 0" class="flex justify-between text-slate-600">
            <span>{{ t("orders.detail.discount") }}</span><span>-{{ formatMain(discount) }}</span>
          </div>
          <div class="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <span>{{ t("orders.detail.total") }}</span>
            <span>{{ formatMain(total) }} <span class="ml-1 text-xs font-normal text-slate-400">{{ formatSecondary(total) }}</span></span>
          </div>
          <p class="text-xs text-slate-400">{{ t("orders.edit.was", { total: formatMain(order.totalAmount), usd: formatUsd(order.totalAmount) }) }}</p>
        </section>

        <!-- Reason -->
        <label class="block">
          <span class="text-sm font-semibold text-slate-700">{{ t("orders.edit.reasonLabel") }}</span>
          <textarea
            v-model="reason"
            rows="2"
            maxlength="200"
            :placeholder="t('orders.edit.reasonPlaceholder')"
            :class="[INPUT_CLASS, 'mt-1']"
          />
        </label>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
        <p v-if="saveError || formError" class="mr-auto text-xs font-medium text-red-700">{{ saveError ?? formError }}</p>
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          :disabled="isSaving"
          @click="emit('close')"
        >
          {{ t("common.cancel") }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canSave"
          @click="save"
        >
          {{ isSaving ? t("common.saving") : t("orders.edit.save") }}
        </button>
      </div>
    </div>
  </div>
</template>
