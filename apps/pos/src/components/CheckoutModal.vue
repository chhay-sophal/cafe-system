<script setup lang="ts">
import { computed, ref } from "vue";
import { submitOrder } from "../lib/api";
import type { CartLineItem } from "../types/cart";
import type { OrderResult, PaymentMethod } from "../types/order";

const props = defineProps<{
  items: CartLineItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  token: string;
}>();

const emit = defineEmits<{
  cancel: [];
  done: [];
}>();

type Phase = "payment" | "submitting" | "success" | "error";

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Credit Card" },
  { value: "QR_CODE", label: "Mobile Pay" },
];

const FAST_CASH_AMOUNTS = [10, 20, 50];

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const phase = ref<Phase>("payment");
const paymentMethod = ref<PaymentMethod>("CASH");
const amountTendered = ref(0);
const errorMessage = ref<string | null>(null);
const orderResult = ref<OrderResult | null>(null);

const isCash = computed(() => paymentMethod.value === "CASH");

const changeDue = computed(() => Math.max(0, amountTendered.value - props.totalAmount));
const amountShort = computed(() => Math.max(0, props.totalAmount - amountTendered.value));
const isInsufficient = computed(() => isCash.value && amountTendered.value < props.totalAmount);
const canComplete = computed(() => !isInsufficient.value);

function format(value: number): string {
  return currencyFormatter.format(value);
}

function selectPaymentMethod(method: PaymentMethod) {
  paymentMethod.value = method;
  amountTendered.value = method === "CASH" ? 0 : props.totalAmount;
}

function addFastCash(amount: number) {
  amountTendered.value = Math.round((amountTendered.value + amount) * 100) / 100;
}

function setExactChange() {
  amountTendered.value = props.totalAmount;
}

function clearTendered() {
  amountTendered.value = 0;
}

function handleTenderedInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  amountTendered.value = Number.isFinite(value) && value >= 0 ? value : 0;
}

async function handleComplete() {
  if (!canComplete.value || phase.value === "submitting") {
    return;
  }

  phase.value = "submitting";
  errorMessage.value = null;

  try {
    const result = await submitOrder(
      {
        items: props.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitBasePrice,
          selectedModifiers: item.modifiers,
        })),
        paymentMethod: paymentMethod.value,
        amountTendered: amountTendered.value,
        taxAmount: props.taxAmount,
        discountAmount: props.discountAmount,
      },
      props.token,
    );

    orderResult.value = result;
    phase.value = "success";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to complete payment.";
    phase.value = "error";
  }
}

function handleCancel() {
  emit("cancel");
}

function handleRetry() {
  phase.value = "payment";
}

function handleDone() {
  emit("done");
}
</script>

<template>
  <div class="checkout-backdrop">
    <div class="checkout-modal" role="dialog" aria-modal="true" aria-label="Checkout">
      <header class="checkout-modal__header">
        <h2>Checkout</h2>
        <button
          v-if="phase === 'payment' || phase === 'error'"
          type="button"
          class="checkout-modal__close"
          aria-label="Close"
          @click="handleCancel"
        >
          &times;
        </button>
      </header>

      <div v-if="phase === 'payment'" class="checkout-modal__body">
        <div class="checkout-total">
          <span>Total Due</span>
          <span class="checkout-total__amount">{{ format(totalAmount) }}</span>
        </div>

        <div class="payment-methods">
          <button
            v-for="method in PAYMENT_METHODS"
            :key="method.value"
            type="button"
            class="payment-method"
            :class="{ 'payment-method--active': paymentMethod === method.value }"
            @click="selectPaymentMethod(method.value)"
          >
            {{ method.label }}
          </button>
        </div>

        <template v-if="isCash">
          <div class="tendered-display">
            <span class="tendered-display__label">Amount Tendered</span>
            <div class="tendered-display__input-wrap">
              <span>$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                :value="amountTendered"
                @input="handleTenderedInput"
              />
            </div>
          </div>

          <div class="fast-cash">
            <button
              v-for="amount in FAST_CASH_AMOUNTS"
              :key="amount"
              type="button"
              class="fast-cash__button"
              @click="addFastCash(amount)"
            >
              +${{ amount }}
            </button>
            <button type="button" class="fast-cash__button fast-cash__button--exact" @click="setExactChange">
              Exact Change
            </button>
          </div>

          <button type="button" class="tendered-clear" @click="clearTendered">Clear</button>

          <div class="change-banner" :class="{ 'change-banner--warning': isInsufficient }">
            <span v-if="isInsufficient">{{ format(amountShort) }} more needed</span>
            <span v-else>Change Due: {{ format(changeDue) }}</span>
          </div>
        </template>

        <button type="button" class="checkout-modal__complete" :disabled="!canComplete" @click="handleComplete">
          Complete Payment
        </button>
      </div>

      <div v-else-if="phase === 'submitting'" class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-modal__status">Processing payment...</p>
      </div>

      <div v-else-if="phase === 'success'" class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-success__label">{{ isCash ? "Change Due" : "Payment Complete" }}</p>
        <p class="checkout-success__amount">
          {{ isCash ? format(orderResult?.changeGiven ?? 0) : format(orderResult?.totalAmount ?? totalAmount) }}
        </p>
        <p class="checkout-success__order">Order #{{ orderResult?.orderNumber }}</p>
        <button type="button" class="checkout-modal__complete" @click="handleDone">Done</button>
      </div>

      <div v-else class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-modal__error">{{ errorMessage }}</p>
        <div class="checkout-error__actions">
          <button type="button" class="checkout-modal__cancel" @click="handleCancel">Cancel</button>
          <button type="button" class="checkout-modal__complete" @click="handleRetry">Try Again</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkout-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.checkout-modal {
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.checkout-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #111111;
  color: #ffffff;
}

.checkout-modal__header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.checkout-modal__close {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.checkout-modal__body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.checkout-modal__body--centered {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 1.5rem;
  min-height: 260px;
}

.checkout-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: #f4f4f4;
}

.checkout-total__amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111111;
}

.payment-methods {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.payment-method {
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  color: #1a1a1a;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 0.1s ease, background-color 0.15s ease, border-color 0.15s ease;
}

.payment-method:active {
  transform: scale(0.96);
}

.payment-method--active {
  background: #111111;
  border-color: #111111;
  color: #ffffff;
}

.tendered-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tendered-display__label {
  font-weight: 600;
  color: #444444;
}

.tendered-display__input-wrap {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 1.2rem;
  font-weight: 700;
}

.tendered-display__input-wrap input {
  width: 120px;
  min-height: 44px;
  border: 2px solid #dcdcdc;
  border-radius: 10px;
  padding: 0.25rem 0.6rem;
  font-size: 1.2rem;
  font-weight: 700;
  text-align: right;
}

.fast-cash {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.fast-cash__button {
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  color: #1a1a1a;
  cursor: pointer;
  touch-action: manipulation;
}

.fast-cash__button:active {
  transform: scale(0.96);
}

.fast-cash__button--exact {
  font-size: 0.8rem;
}

.tendered-clear {
  align-self: flex-end;
  border: none;
  background: transparent;
  color: #888888;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.change-banner {
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: #e6f6ec;
  color: #1c7a41;
  font-weight: 700;
  font-size: 1.1rem;
  text-align: center;
}

.change-banner--warning {
  background: #fbe9e7;
  color: #c0392b;
}

.checkout-modal__complete {
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid #111111;
  background: #111111;
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

.checkout-modal__complete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.checkout-modal__cancel {
  min-height: 52px;
  padding: 0 1.25rem;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.checkout-modal__status {
  font-size: 1.1rem;
  font-weight: 600;
  color: #444444;
}

.checkout-modal__error {
  color: #c0392b;
  font-weight: 600;
}

.checkout-error__actions {
  display: flex;
  gap: 0.75rem;
}

.checkout-success__label {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #444444;
}

.checkout-success__amount {
  margin: 0.25rem 0 0.5rem;
  font-size: 3rem;
  font-weight: 800;
  color: #1c7a41;
}

.checkout-success__order {
  margin: 0 0 1.5rem;
  color: #888888;
  font-size: 0.9rem;
}

@media (prefers-color-scheme: dark) {
  .checkout-modal {
    background: #242424;
  }

  .checkout-total {
    background: #2f2f2f;
  }

  .checkout-total__amount {
    color: #f2f2f2;
  }

  .payment-method {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .payment-method--active {
    background: #ffffff;
    border-color: #ffffff;
    color: #111111;
  }

  .tendered-display__label {
    color: #dddddd;
  }

  .tendered-display__input-wrap input {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .fast-cash__button {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .checkout-modal__cancel {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .checkout-modal__complete {
    background: #ffffff;
    border-color: #ffffff;
    color: #111111;
  }

  .checkout-modal__complete:disabled {
    opacity: 0.35;
  }
}
</style>
