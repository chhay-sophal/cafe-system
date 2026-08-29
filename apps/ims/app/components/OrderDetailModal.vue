<script setup lang="ts">
import { computed } from "vue";

const { t } = useI18n();
const ordersStore = useOrdersStore();
const { formatMain, formatSecondary, formatUsd, formatRiel } = useCurrency();

const isOpen = computed(
  () => ordersStore.isDetailLoading || ordersStore.selectedOrder !== null || ordersStore.detailError !== null,
);

function close() {
  ordersStore.clearSelectedOrder();
}

function formatDateTime(value: string): string {
  return new Date(value.replace(" ", "T")).toLocaleString();
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="close">
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
              {{ formatDateTime(ordersStore.selectedOrder.createdAt) }} · {{ ordersStore.selectedOrder.cashierName ?? t("common.dash") }}
            </p>
          </div>
          <button type="button" class="text-2xl leading-none text-slate-400 hover:text-slate-600" @click="close">
            &times;
          </button>
        </div>

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
      </template>
    </div>
  </div>
</template>
