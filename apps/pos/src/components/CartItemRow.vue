<script setup lang="ts">
import { computed, ref } from "vue";
import type { CartLineItem } from "../types/cart";

const props = defineProps<{
  item: CartLineItem;
}>();

const emit = defineEmits<{
  increment: [];
  decrement: [];
  remove: [];
}>();

const SWIPE_OPEN_OFFSET = -88;

const offset = ref(0);
const dragStartX = ref(0);
const baseOffsetAtDragStart = ref(0);
const isDragging = ref(false);

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const unitPrice = computed(
  () => props.item.unitBasePrice + props.item.modifiers.reduce((sum, mod) => sum + mod.priceExtra, 0),
);
const lineTotal = computed(() => unitPrice.value * props.item.quantity);

function format(value: number): string {
  return currencyFormatter.format(value);
}

function onPointerDown(event: PointerEvent) {
  isDragging.value = true;
  dragStartX.value = event.clientX;
  baseOffsetAtDragStart.value = offset.value;
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!isDragging.value) {
    return;
  }
  const delta = event.clientX - dragStartX.value;
  const next = baseOffsetAtDragStart.value + delta;
  offset.value = Math.min(0, Math.max(SWIPE_OPEN_OFFSET, next));
}

function onPointerUp() {
  if (!isDragging.value) {
    return;
  }
  isDragging.value = false;
  offset.value = offset.value < SWIPE_OPEN_OFFSET / 2 ? SWIPE_OPEN_OFFSET : 0;
}
</script>

<template>
  <div class="cart-row-wrap">
    <button type="button" class="cart-row__swipe-remove" @click="emit('remove')">Remove</button>

    <div
      class="cart-row"
      :style="{ transform: `translateX(${offset}px)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="cart-row__top">
        <span class="cart-row__name">{{ item.productName }}</span>
        <span class="cart-row__line-total">{{ format(lineTotal) }}</span>
        <button type="button" class="cart-row__close" aria-label="Remove item" @click="emit('remove')">
          &times;
        </button>
      </div>

      <ul v-if="item.modifiers.length > 0" class="cart-row__modifiers">
        <li v-for="mod in item.modifiers" :key="mod.id">
          {{ mod.name }}
          <span v-if="mod.priceExtra">(+{{ format(mod.priceExtra) }})</span>
        </li>
      </ul>

      <div class="cart-row__bottom">
        <div class="cart-row__stepper">
          <button type="button" aria-label="Decrease quantity" @click="emit('decrement')">-</button>
          <span class="cart-row__quantity">{{ item.quantity }}</span>
          <button type="button" aria-label="Increase quantity" @click="emit('increment')">+</button>
        </div>
        <span class="cart-row__unit-price">{{ format(unitPrice) }} each</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cart-row-wrap {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 14px;
  border: 2px solid var(--border-color, #e2e2e2);
  background: #ffffff;
}

.cart-row__swipe-remove {
  position: absolute;
  inset: 0;
  width: 100%;
  border: none;
  background: #c0392b;
  color: #ffffff;
  font-weight: 700;
  text-align: right;
  padding-right: 1.5rem;
  cursor: pointer;
}

.cart-row {
  position: relative;
  background: #ffffff;
  padding: 0.75rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  transition: transform 0.15s ease;
  touch-action: pan-y;
}

.cart-row__top {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.cart-row__name {
  flex: 1;
  font-weight: 700;
  color: #1a1a1a;
}

.cart-row__line-total {
  font-weight: 700;
  color: #1a1a1a;
}

.cart-row__close {
  border: none;
  background: transparent;
  color: #999999;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  min-width: 32px;
  min-height: 32px;
}

.cart-row__modifiers {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
  color: #666666;
}

.cart-row__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cart-row__stepper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cart-row__stepper button {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.cart-row__stepper button:active {
  transform: scale(0.92);
}

.cart-row__quantity {
  min-width: 1.5rem;
  text-align: center;
  font-weight: 700;
}

.cart-row__unit-price {
  font-size: 0.8rem;
  color: #888888;
}

@media (prefers-color-scheme: dark) {
  .cart-row-wrap {
    border-color: #3a3a3a;
  }

  .cart-row {
    background: #242424;
  }

  .cart-row__name,
  .cart-row__line-total {
    color: #f2f2f2;
  }

  .cart-row__stepper button {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }
}
</style>
