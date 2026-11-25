<script setup lang="ts">
import { computed, ref, watch } from "vue";

const { t, locale } = useI18n();
const ordersStore = useOrdersStore();
const { formatMain, formatSecondary, formatUsd, formatRiel } = useCurrency();

const isOpen = computed(
  () => ordersStore.isDetailLoading || ordersStore.selectedOrder !== null || ordersStore.detailError !== null,
);

const order = computed(() => ordersStore.selectedOrder);
// Every IMS login is a manager or admin, so anyone here may edit or void a
// completed order (the backend checks the role too).
const canChange = computed(() => order.value?.status === "COMPLETED");

const isEditing = ref(false);
const isConfirmingVoid = ref(false);
const voidReason = ref("");
const isVoiding = ref(false);
const voidError = ref<string | null>(null);

// A different order (or none) - drop any half-finished void or edit.
watch(
  () => order.value?.id,
  () => {
    isEditing.value = false;
    isConfirmingVoid.value = false;
    voidReason.value = "";
    voidError.value = null;
  },
);

async function confirmVoid() {
  if (!order.value || voidReason.value.trim() === "" || isVoiding.value) {
    return;
  }
  isVoiding.value = true;
  voidError.value = null;
  try {
    await ordersStore.voidOrder(order.value.id, voidReason.value.trim());
    isConfirmingVoid.value = false;
  } catch (error) {
    voidError.value = error instanceof Error ? error.message : t("orders.void.error");
  } finally {
    isVoiding.value = false;
  }
}

function close() {
  ordersStore.clearSelectedOrder();
}

// Closes on a click outside it or Escape (see useDismiss).
const dismiss = useDismiss(() => isOpen.value, close, () => isVoiding.value);
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @pointerdown="dismiss.onPointerDown" @click="dismiss.onClick">
    <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
      <p v-if="ordersStore.isDetailLoading" class="p-6 text-center text-sm text-slate-500">{{ t("orders.detail.loading") }}</p>

      <p v-else-if="ordersStore.detailError" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
        {{ ordersStore.detailError }}
      </p>

      <template v-else-if="ordersStore.selectedOrder">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900">
              {{ t("orders.detail.heading", { number: ordersStore.selectedOrder.orderNumber }) }}
            </h2>
            <p class="text-xs text-slate-500">
              {{ formatDateTime(ordersStore.selectedOrder.createdAt, locale) }} · {{ ordersStore.selectedOrder.cashierName ?? t("common.dash") }}
            </p>
          </div>
          <button type="button" class="text-2xl leading-none text-slate-400 hover:text-slate-600" :aria-label="t('common.close')" @click="close">
            &times;
          </button>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            :class="ordersStore.selectedOrder.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'"
          >
            {{ t(`orders.status.${ordersStore.selectedOrder.status}`) }}
          </span>
          <span v-if="ordersStore.selectedOrder.editedAt" class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            {{ t("orders.edited") }}
          </span>
        </div>

        <p v-if="ordersStore.selectedOrder.status === 'VOIDED'" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {{ t("orders.void.voidedBy", {
            name: ordersStore.selectedOrder.voidedByName ?? t("common.dash"),
            time: ordersStore.selectedOrder.voidedAt ? formatDateTime(ordersStore.selectedOrder.voidedAt, locale) : t("common.dash"),
          }) }}
          <span v-if="ordersStore.selectedOrder.voidReason" class="mt-1 block font-medium">“{{ ordersStore.selectedOrder.voidReason }}”</span>
        </p>

        <p v-if="ordersStore.selectedOrder.editedAt" class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {{ t("orders.edit.editedBy", {
            name: ordersStore.selectedOrder.editedByName ?? t("common.dash"),
            time: formatDateTime(ordersStore.selectedOrder.editedAt, locale),
          }) }}
          <span v-if="ordersStore.selectedOrder.editReason" class="mt-1 block font-medium">“{{ ordersStore.selectedOrder.editReason }}”</span>
        </p>

        <div class="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          <div v-for="item in ordersStore.selectedOrder.items" :key="item.id" class="p-3">
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-800">{{ item.quantity }}&times; {{ item.productName }}</span>
              <span class="text-slate-700">{{ formatMain(item.totalPrice) }}</span>
            </div>
            <ul v-if="item.modifiers.length > 0" class="mt-1 text-xs text-slate-500">
              <li v-for="(mod, index) in item.modifiers" :key="index">
                {{ mod.modifierName }}<span v-if="mod.priceExtra"> (+{{ formatMain(mod.priceExtra) }})</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="mt-4 space-y-1 text-sm">
          <div class="flex justify-between text-slate-600">
            <span>{{ t("orders.detail.subtotal") }}</span>
            <span>{{ formatMain(ordersStore.selectedOrder.subtotal) }}</span>
          </div>
          <div class="flex justify-between text-slate-600">
            <span>{{ t("orders.detail.tax") }}</span>
            <span>{{ formatMain(ordersStore.selectedOrder.taxAmount) }}</span>
          </div>
          <div v-if="ordersStore.selectedOrder.discountAmount > 0" class="flex justify-between text-slate-600">
            <span>{{ t("orders.detail.discount") }}</span>
            <span>-{{ formatMain(ordersStore.selectedOrder.discountAmount) }}</span>
          </div>
          <div class="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <span>{{ t("orders.detail.total") }}</span>
            <span>
              {{ formatMain(ordersStore.selectedOrder.totalAmount) }}
              <span class="ml-1 text-xs font-normal text-slate-400">{{ formatSecondary(ordersStore.selectedOrder.totalAmount) }}</span>
            </span>
          </div>
        </div>

        <div v-if="ordersStore.selectedOrder.payment" class="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          <p class="font-semibold text-slate-700">
            {{ t(`paymentBreakdown.methods.${ordersStore.selectedOrder.payment.paymentMethod}`) }}
          </p>
          <template v-if="ordersStore.selectedOrder.payment.paymentMethod === 'CASH'">
            <p class="mt-1 text-slate-600">
              {{ t("orders.detail.tendered") }}: {{ formatUsd(ordersStore.selectedOrder.payment.amountTenderedUsd) }}
              <template v-if="ordersStore.selectedOrder.payment.amountTenderedRiel > 0">
                + {{ formatRiel(ordersStore.selectedOrder.payment.amountTenderedRiel) }}
              </template>
            </p>
            <p class="text-slate-600">
              {{ t("orders.detail.change") }}: {{ formatUsd(ordersStore.selectedOrder.payment.changeGivenUsd) }}
              <template v-if="ordersStore.selectedOrder.payment.changeGivenRiel > 0">
                + {{ formatRiel(ordersStore.selectedOrder.payment.changeGivenRiel) }}
              </template>
            </p>
          </template>
        </div>

        <div v-if="canChange && isConfirmingVoid" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p class="text-sm font-semibold text-red-700">{{ t("orders.void.confirm") }}</p>
          <label class="mt-2 block text-xs font-medium text-slate-700" for="void-reason">{{ t("orders.void.reasonLabel") }}</label>
          <textarea
            id="void-reason"
            v-model="voidReason"
            rows="2"
            maxlength="200"
            :placeholder="t('orders.void.reasonPlaceholder')"
            class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <p v-if="voidError" class="mt-1 text-xs font-medium text-red-700">{{ voidError }}</p>
          <div class="mt-2 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              :disabled="isVoiding"
              @click="isConfirmingVoid = false"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              type="button"
              class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="voidReason.trim() === '' || isVoiding"
              @click="confirmVoid"
            >
              {{ isVoiding ? t("orders.void.voiding") : t("orders.void.confirmButton") }}
            </button>
          </div>
        </div>

        <div v-else-if="canChange" class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
            @click="isConfirmingVoid = true"
          >
            {{ t("orders.void.button") }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover"
            @click="isEditing = true"
          >
            {{ t("orders.edit.button") }}
          </button>
        </div>
      </template>
    </div>

    <OrderEditModal v-if="isEditing && order" :order="order" @close="isEditing = false" />
  </div>
</template>
