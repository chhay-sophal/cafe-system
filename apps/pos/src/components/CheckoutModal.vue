<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { HttpError, submitOrder } from "../lib/api";
import { computeChange, formatMain, formatRiel, formatSecondary, formatUsd, round2 } from "../lib/currency";
import { useAuth } from "../composables/useAuth";
import { useExchangeRate } from "../composables/useExchangeRate";
import { formatFastCashLabel, useFastCash } from "../composables/useFastCash";
import { publishPaymentQr, publishSaleCompleted } from "../composables/useCustomerDisplayChannel";
import { useKhqrBanks } from "../composables/useKhqrBanks";
import { useNetworkStatus } from "../composables/useNetworkStatus";
import { useOfflineQueue } from "../composables/useOfflineQueue";
import { usePaymentMethods } from "../composables/usePaymentMethods";
import { useReceiptPrinter } from "../composables/useReceiptPrinter";
import { storeFooterBlocks, storeHeaderBlocks } from "../composables/useStoreDetails";
import { useStoreName } from "../composables/useStoreName";
import { formatReceiptDate, type ReceiptBlock } from "../lib/receipt";
import type { CartLineItem } from "../types/cart";
import type { OrderPayload, OrderResult, PaymentMethod } from "../types/order";

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
type PrintStatus = "idle" | "printing" | "printed" | "failed" | "noPrinter";

const { t } = useI18n({ useScope: "global" });
const { storeName } = useStoreName();

// Only the methods this register offers (Settings → Payments).
const { enabledMethods } = usePaymentMethods();
const PAYMENT_METHODS = computed<Array<{ value: PaymentMethod; label: string }>>(() =>
  enabledMethods.value.map((method) => ({ value: method, label: t(`checkout.methods.${method}`) })),
);

// Quick-add tender buttons, configured per register in Settings → Payments.
const { amounts: fastCashAmounts } = useFastCash();

const network = useNetworkStatus();
const offlineQueue = useOfflineQueue();
const { exchangeRateRielPerUsd, mainCurrency } = useExchangeRate();
const auth = useAuth();
const receiptPrinter = useReceiptPrinter();

const phase = ref<Phase>("payment");
const paymentMethod = ref<PaymentMethod>("CASH");
const amountTenderedUsd = ref(0);
const amountTenderedRiel = ref(0);
const errorMessage = ref<string | null>(null);
const orderResult = ref<OrderResult | null>(null);
const isQueuedOffline = ref(false);
const printStatus = ref<PrintStatus>("idle");
const printError = ref<string | null>(null);
// Snapshotted when the sale succeeds, so a reprint still has the sale's
// items even after the cart behind `props.items` has moved on.
let receiptBlocks: ReceiptBlock[] = [];

const isCash = computed(() => paymentMethod.value === "CASH");

// The Riel leg is converted back to USD via the live exchange rate so
// tendering can mix both currencies (e.g. $3 + 2,000 riel) against a
// USD-denominated total.
const tenderedTotalUsd = computed(() => amountTenderedUsd.value + amountTenderedRiel.value / exchangeRateRielPerUsd.value);

const changeDueUsd = computed(() => Math.max(0, round2(tenderedTotalUsd.value - props.totalAmount)));
// Pure-USD tender gets USD notes + a Riel remainder; pure-Riel or mixed
// tender gets change entirely in Riel. Mirrors the backend's authoritative
// rule (POST /api/orders) for the optimistic/offline display.
const changeSplit = computed(() =>
  computeChange(changeDueUsd.value, exchangeRateRielPerUsd.value, amountTenderedUsd.value, amountTenderedRiel.value),
);

const amountShort = computed(() => Math.max(0, round2(props.totalAmount - tenderedTotalUsd.value)));
const isInsufficient = computed(() => isCash.value && round2(tenderedTotalUsd.value) < round2(props.totalAmount));
const khqrBanks = useKhqrBanks();
const selectedBankId = ref<string | null>(null);
const selectedBank = computed(() => khqrBanks.banks.value.find((bank) => bank.id === selectedBankId.value) ?? null);
const isQrPayment = computed(() => paymentMethod.value === "QR_CODE");
// With banks set up, Mobile Pay needs one picked so the customer has a QR
// to scan. With none set up, it works as before (customer scans elsewhere).
const isMissingBank = computed(() => isQrPayment.value && khqrBanks.banks.value.length > 0 && !selectedBank.value);

const canComplete = computed(() => !isInsufficient.value && !isMissingBank.value);

const successLabel = computed(() => {
  if (isQueuedOffline.value) {
    return t("checkout.orderQueued");
  }
  return isCash.value ? t("checkout.changeDueLabel") : t("checkout.paymentComplete");
});

// Offline orders have no server-confirmed change/total yet, so fall back to
// the client-side calculation until the sync engine reconciles them.
const finalChange = computed(() =>
  isQueuedOffline.value || !orderResult.value
    ? changeSplit.value
    : { usd: orderResult.value.changeGivenUsd, riel: orderResult.value.changeGivenRiel },
);

const finalTotal = computed(() =>
  isQueuedOffline.value ? props.totalAmount : orderResult.value?.totalAmount ?? props.totalAmount,
);

const successDisplay = computed(() =>
  isCash.value ? formatChangeAmount(finalChange.value.usd, finalChange.value.riel) : format(finalTotal.value),
);

function format(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

function formatSecondaryAmount(value: number): string {
  return formatSecondary(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

// USD/Riel tender order follows the main-currency setting so the more
// prominent currency's input and fast-cash row appear first.
const isMainKhr = computed(() => mainCurrency.value === "KHR");

function formatChangeAmount(usd: number, riel: number): string {
  if (usd > 0 && riel > 0) {
    return `${formatUsd(usd)} + ${formatRiel(riel)}`;
  }
  if (riel > 0) {
    return formatRiel(riel);
  }
  return formatUsd(usd);
}

function selectPaymentMethod(method: PaymentMethod) {
  paymentMethod.value = method;
  amountTenderedUsd.value = method === "CASH" ? 0 : props.totalAmount;
  amountTenderedRiel.value = 0;
  // A single bank is the only possible choice - save the cashier a tap.
  const onlyBank = khqrBanks.banks.value.length === 1 ? khqrBanks.banks.value[0] : null;
  selectedBankId.value = method === "QR_CODE" && onlyBank ? onlyBank.id : null;
}

// Start on the first method this register offers - Cash unless it's turned
// off - with the tender preset that method needs.
selectPaymentMethod(enabledMethods.value[0]);

// The customer display shows the chosen bank's KHQR while payment is in
// progress, and drops it once the sale succeeds or checkout is closed.
watch([selectedBank, isQrPayment, phase], () => {
  const bank = selectedBank.value;
  const showQr = bank && isQrPayment.value && phase.value !== "success";
  publishPaymentQr(showQr ? { bankName: bank.name, qrImage: bank.qrImage } : null);
});

onUnmounted(() => publishPaymentQr(null));

function addFastCashUsd(amount: number) {
  amountTenderedUsd.value = round2(amountTenderedUsd.value + amount);
}

function addFastCashRiel(amount: number) {
  amountTenderedRiel.value = amountTenderedRiel.value + amount;
}

function setExactChange() {
  amountTenderedUsd.value = props.totalAmount;
  amountTenderedRiel.value = 0;
}

function clearTendered() {
  amountTenderedUsd.value = 0;
  amountTenderedRiel.value = 0;
}

// A tendered field's text: empty while its amount is 0 (so the "0"
// placeholder shows instead of a pre-filled 0), otherwise left exactly as
// typed - binding the number directly would wipe a typed "0" on its way to
// "0.5". Replaced only when the amount stops matching it, i.e. when the
// fast-cash buttons, Exact, Clear or a payment method switch change it.
function amountText(amount: Ref<number>): Ref<string> {
  const text = ref("");
  watch(
    amount,
    (value) => {
      if (Math.abs((Number(text.value) || 0) - value) > 1e-9) {
        text.value = value === 0 ? "" : String(value);
      }
    },
    { immediate: true },
  );
  return text;
}

const tenderedUsdText = amountText(amountTenderedUsd);
const tenderedRielText = amountText(amountTenderedRiel);

// Empty, negative or half-typed input counts as nothing tendered.
function parseTendered(text: string): number {
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function handleTenderedUsdInput(event: Event) {
  tenderedUsdText.value = (event.target as HTMLInputElement).value;
  amountTenderedUsd.value = parseTendered(tenderedUsdText.value);
}

function handleTenderedRielInput(event: Event) {
  tenderedRielText.value = (event.target as HTMLInputElement).value;
  amountTenderedRiel.value = parseTendered(tenderedRielText.value);
}

function buildOrderPayload(): OrderPayload {
  return {
    items: props.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitBasePrice,
      selectedModifiers: item.modifiers,
    })),
    paymentMethod: paymentMethod.value,
    amountTenderedUsd: amountTenderedUsd.value,
    amountTenderedRiel: amountTenderedRiel.value,
    taxAmount: props.taxAmount,
    discountAmount: props.discountAmount,
  };
}

async function queueOffline(payload: OrderPayload) {
  try {
    await offlineQueue.enqueue(payload);
    orderResult.value = null;
    isQueuedOffline.value = true;
    phase.value = "success";
  } catch (error) {
    // Even local persistence can fail (e.g. IndexedDB unavailable/full) - the
    // cashier still needs to know the sale did not go through anywhere.
    errorMessage.value = error instanceof Error ? error.message : t("checkout.saveLocalError");
    phase.value = "error";
  }
}

async function handleComplete() {
  if (!canComplete.value || phase.value === "submitting") {
    return;
  }

  phase.value = "submitting";
  errorMessage.value = null;
  const payload = buildOrderPayload();

  // Already known offline - skip the network round trip entirely so the
  // cashier never sits staring at a spinner waiting for a doomed request.
  if (!network.isOnline.value) {
    await queueOffline(payload);
    return;
  }

  try {
    const result = await submitOrder(payload, props.token);
    orderResult.value = result;
    isQueuedOffline.value = false;
    phase.value = "success";
  } catch (error) {
    if (error instanceof HttpError) {
      // Server was reached and rejected the request - a real error, not a
      // connectivity problem, so surface it instead of silently queueing.
      errorMessage.value = error.message;
      phase.value = "error";
      return;
    }

    // navigator.onLine said we were connected but the request still failed
    // outright (unreachable host, timed out) - treat it the same as offline.
    await queueOffline(payload);
  }
}

function buildReceiptBlocks(): ReceiptBlock[] {
  const subtotal = isQueuedOffline.value ? props.subtotal : orderResult.value?.subtotal ?? props.subtotal;
  const orderLabel = isQueuedOffline.value
    ? t("receipt.pendingSync")
    : t("checkout.orderNumber", { number: orderResult.value?.orderNumber });

  const storeHeader = storeHeaderBlocks();
  const blocks: ReceiptBlock[] = [
    { type: "text", text: storeName.value, align: "center", size: "large", bold: true },
    // Address, phones and emails from Settings → General, set apart from the
    // sale details below.
    ...storeHeader,
    ...(storeHeader.length > 0 ? [{ type: "spacer", height: 8 } as const] : []),
    { type: "text", text: formatReceiptDate(new Date()), align: "center", size: "small" },
    { type: "text", text: orderLabel, align: "center", bold: true },
  ];

  const cashierName = auth.session.value?.user.name;
  if (cashierName) {
    blocks.push({ type: "text", text: t("receipt.cashier", { name: cashierName }), align: "center", size: "small" });
  }

  blocks.push({ type: "divider" });

  for (const item of props.items) {
    const unitPrice = item.unitBasePrice + item.modifiers.reduce((sum, modifier) => sum + modifier.priceExtra, 0);
    blocks.push({ type: "row", left: `${item.quantity} x ${item.productName}`, right: format(unitPrice * item.quantity) });
    for (const modifier of item.modifiers) {
      blocks.push({ type: "text", text: `+ ${modifier.name}`, size: "small", indent: 24 });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "row", left: t("cart.subtotal"), right: format(subtotal) });
  if (props.taxAmount > 0) {
    blocks.push({ type: "row", left: t("cart.tax"), right: format(props.taxAmount) });
  }
  if (props.discountAmount > 0) {
    blocks.push({ type: "row", left: t("cart.discount"), right: `-${format(props.discountAmount)}` });
  }
  blocks.push({ type: "row", left: t("cart.total"), right: format(finalTotal.value), size: "large", bold: true });
  blocks.push({ type: "row", left: "", right: formatSecondaryAmount(finalTotal.value), size: "small" });

  blocks.push({ type: "divider" });
  blocks.push({ type: "row", left: t("receipt.payment"), right: t(`checkout.methods.${paymentMethod.value}`) });
  if (isCash.value) {
    if (amountTenderedUsd.value > 0) {
      blocks.push({ type: "row", left: t("receipt.tendered"), right: formatUsd(amountTenderedUsd.value) });
    }
    if (amountTenderedRiel.value > 0) {
      blocks.push({ type: "row", left: t("receipt.tendered"), right: formatRiel(amountTenderedRiel.value) });
    }
    blocks.push({
      type: "row",
      left: t("checkout.changeDueLabel"),
      right: formatChangeAmount(finalChange.value.usd, finalChange.value.riel),
      bold: true,
    });
  }

  blocks.push({ type: "spacer", height: 12 });
  blocks.push({ type: "text", text: t("receipt.thankYou"), align: "center" });
  // Social media under the thanks, where customers look for where to follow.
  blocks.push(...storeFooterBlocks());
  return blocks;
}

// Never blocks the sale - it has already gone through by the time this
// runs. A failure only shows on the success screen with a reprint option.
async function printSaleReceipt() {
  if (!receiptPrinter.printerName.value) {
    printStatus.value = "noPrinter";
    return;
  }

  printStatus.value = "printing";
  printError.value = null;
  try {
    await receiptPrinter.printReceipt(receiptBlocks);
    printStatus.value = "printed";
  } catch (error) {
    // Rust command errors arrive as plain strings, not Error objects.
    printError.value = error instanceof Error ? error.message : String(error);
    printStatus.value = "failed";
  }
}

// Publishes the finished sale to the customer-facing display once, at the
// exact moment the sale actually succeeds (online or queued offline) -
// matches successDisplay's own preference for the server-confirmed change
// amounts over the locally-computed ones when both are available. The
// receipt prints at the same moment.
watch(phase, (newPhase) => {
  if (newPhase !== "success") {
    return;
  }

  receiptBlocks = buildReceiptBlocks();
  printSaleReceipt();

  const change = finalChange.value;

  publishSaleCompleted({
    items: props.items.map((item) => {
      const unitPrice = item.unitBasePrice + item.modifiers.reduce((sum, modifier) => sum + modifier.priceExtra, 0);
      return {
        cartItemId: item.cartItemId,
        productName: item.productName,
        modifierNames: item.modifiers.map((modifier) => modifier.name),
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      };
    }),
    discountAmount: props.discountAmount,
    totalAmount: props.totalAmount,
    paymentMethod: paymentMethod.value,
    amountTenderedUsd: amountTenderedUsd.value,
    amountTenderedRiel: amountTenderedRiel.value,
    changeGivenUsd: change.usd,
    changeGivenRiel: change.riel,
  });
});

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
    <div
      class="checkout-modal"
      :class="{ 'checkout-modal--wide': phase === 'payment' }"
      role="dialog"
      aria-modal="true"
      :aria-label="t('checkout.dialogAriaLabel')"
    >
      <header class="checkout-modal__header">
        <h2>{{ t("checkout.heading") }}</h2>
        <button
          v-if="phase === 'payment' || phase === 'error'"
          type="button"
          class="checkout-modal__close"
          :aria-label="t('common.close')"
          @click="handleCancel"
        >
          &times;
        </button>
      </header>

      <!-- Two columns on landscape screens: the decision (total, method,
           change, Complete) on the left, the tender details on the right -
           so Complete never scrolls out of view. One column when narrow. -->
      <div v-if="phase === 'payment'" class="checkout-pay">
        <div class="checkout-total checkout-pay__total">
          <span class="checkout-total__label">{{ t("checkout.totalDue") }}</span>
          <span class="checkout-total__amount">{{ format(totalAmount) }}</span>
          <span class="checkout-total__amount-secondary">{{ formatSecondaryAmount(totalAmount) }}</span>
        </div>

        <div class="payment-methods checkout-pay__methods" role="radiogroup" :aria-label="t('receipt.payment')">
          <button
            v-for="method in PAYMENT_METHODS"
            :key="method.value"
            type="button"
            role="radio"
            :aria-checked="paymentMethod === method.value"
            class="payment-method"
            :class="{ 'payment-method--active': paymentMethod === method.value }"
            @click="selectPaymentMethod(method.value)"
          >
            {{ method.label }}
          </button>
        </div>

        <div class="checkout-pay__detail">
          <template v-if="isCash">
            <div class="tender-section" :style="{ order: isMainKhr ? 2 : 1 }">
              <label class="tendered-display">
                <span class="tendered-display__label">{{ t("checkout.amountTenderedUsd") }}</span>
                <span class="tendered-display__input-wrap">
                  <span>$</span>
                  <input
                    v-numeric
                    type="text"
                    inputmode="decimal"
                    placeholder="0"
                    :value="tenderedUsdText"
                    @input="handleTenderedUsdInput"
                  />
                </span>
              </label>

              <div class="fast-cash">
                <button
                  v-for="amount in fastCashAmounts.USD.value"
                  :key="amount"
                  type="button"
                  class="fast-cash__button"
                  @click="addFastCashUsd(amount)"
                >
                  {{ formatFastCashLabel("USD", amount) }}
                </button>
                <button type="button" class="fast-cash__button fast-cash__button--exact" @click="setExactChange">
                  {{ t("checkout.exactChange") }}
                </button>
              </div>
            </div>

            <div class="tender-section" :style="{ order: isMainKhr ? 1 : 2 }">
              <label class="tendered-display">
                <span class="tendered-display__label">{{ t("checkout.amountTenderedRiel") }}</span>
                <span class="tendered-display__input-wrap">
                  <input
                    v-numeric
                    type="text"
                    inputmode="decimal"
                    placeholder="0"
                    :value="tenderedRielText"
                    @input="handleTenderedRielInput"
                  />
                  <span>៛</span>
                </span>
              </label>

              <div v-if="fastCashAmounts.KHR.value.length > 0" class="fast-cash">
                <button
                  v-for="amount in fastCashAmounts.KHR.value"
                  :key="amount"
                  type="button"
                  class="fast-cash__button"
                  @click="addFastCashRiel(amount)"
                >
                  {{ formatFastCashLabel("KHR", amount) }}
                </button>
              </div>
            </div>

            <button type="button" class="tendered-clear" @click="clearTendered">{{ t("common.clear") }}</button>
          </template>

          <div v-else-if="isQrPayment" class="qr-banks">
            <span class="qr-banks__label">{{ t("checkout.chooseBank") }}</span>
            <p v-if="khqrBanks.banks.value.length === 0" class="checkout-pay__note">{{ t("checkout.noBanks") }}</p>
            <div v-else class="qr-banks__options">
              <button
                v-for="bank in khqrBanks.banks.value"
                :key="bank.id"
                type="button"
                class="payment-method"
                :class="{ 'payment-method--active': selectedBankId === bank.id }"
                @click="selectedBankId = bank.id"
              >
                {{ bank.name }}
              </button>
            </div>
          </div>

          <p v-else class="checkout-pay__note">{{ t("checkout.cardNote") }}</p>
        </div>

        <div class="checkout-pay__footer">
          <div v-if="isCash" class="change-banner" :class="{ 'change-banner--warning': isInsufficient }" aria-live="polite">
            <span v-if="isInsufficient">{{ t("checkout.amountShort", { amount: format(amountShort) }) }}</span>
            <span v-else>{{ t("checkout.changeDue", { amount: formatChangeAmount(changeSplit.usd, changeSplit.riel) }) }}</span>
          </div>

          <button type="button" class="checkout-modal__complete" :disabled="!canComplete" @click="handleComplete">
            {{ t("checkout.completePayment") }}
          </button>
        </div>
      </div>

      <div v-else-if="phase === 'submitting'" class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-modal__status">{{ t("checkout.processing") }}</p>
      </div>

      <div v-else-if="phase === 'success'" class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-success__label">{{ successLabel }}</p>
        <p class="checkout-success__amount">{{ successDisplay }}</p>
        <p v-if="isQueuedOffline" class="checkout-success__order">{{ t("checkout.savedOffline") }}</p>
        <p v-else class="checkout-success__order">{{ t("checkout.orderNumber", { number: orderResult?.orderNumber }) }}</p>
        <p v-if="printStatus === 'printing'" class="checkout-print">{{ t("receipt.printing") }}</p>
        <p v-else-if="printStatus === 'printed'" class="checkout-print">{{ t("receipt.printed") }}</p>
        <p v-else-if="printStatus === 'noPrinter'" class="checkout-print checkout-print--warning">{{ t("receipt.noPrinter") }}</p>
        <p v-else-if="printStatus === 'failed'" class="checkout-print checkout-print--warning">
          {{ t("receipt.failed", { error: printError }) }}
        </p>
        <div class="checkout-error__actions">
          <button
            v-if="printStatus === 'printed' || printStatus === 'failed'"
            type="button"
            class="checkout-modal__cancel"
            @click="printSaleReceipt"
          >
            {{ t("receipt.reprint") }}
          </button>
          <button type="button" class="checkout-modal__complete" @click="handleDone">{{ t("common.done") }}</button>
        </div>
      </div>

      <div v-else class="checkout-modal__body checkout-modal__body--centered">
        <p class="checkout-modal__error">{{ errorMessage }}</p>
        <div class="checkout-error__actions">
          <button type="button" class="checkout-modal__cancel" @click="handleCancel">{{ t("common.cancel") }}</button>
          <button type="button" class="checkout-modal__complete" @click="handleRetry">{{ t("common.tryAgain") }}</button>
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
  max-width: 460px;
  max-height: calc(100vh - 2rem);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

/* The payment step's two columns need the room; the processing, success
   and error steps stay narrow. */
.checkout-modal--wide {
  max-width: 820px;
}

.checkout-modal__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem 0.5rem 1.25rem;
  background: var(--color-primary);
  color: #ffffff;
}

.checkout-modal__header h2 {
  margin: 0;
  font-size: 1.1rem;
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
  overflow-y: auto;
}

.checkout-modal__body--centered {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1.5rem;
  min-height: 240px;
}

/* ---- Payment step -------------------------------------------------- */

.checkout-pay {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  grid-template-rows: auto auto 1fr;
  grid-template-areas:
    "total   detail"
    "methods detail"
    "footer  detail";
  gap: 0.75rem 1.25rem;
  padding: 1rem 1.25rem 1.25rem;
}

.checkout-pay__total {
  grid-area: total;
}

.checkout-pay__methods {
  grid-area: methods;
}

/* Change + Complete sit at the bottom of the left column. */
.checkout-pay__footer {
  grid-area: footer;
  align-self: end;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Only this column scrolls, and only if the screen is too short for it. */
.checkout-pay__detail {
  grid-area: detail;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  /* Right padding keeps the riel sign after its input from being clipped by
     this scrolling column's edge. */
  padding: 0 0.25rem 0 1.25rem;
  border-left: 2px solid #eeeeee;
}

.checkout-pay__note {
  margin: auto 0;
  padding: 1rem;
  border-radius: 12px;
  background: #f4f4f4;
  color: #666666;
  font-size: 0.95rem;
  text-align: center;
}

.checkout-total {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: #f4f4f4;
}

.checkout-total__label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #666666;
}

.checkout-total__amount {
  font-size: 1.9rem;
  font-weight: 800;
  line-height: 1.2;
  color: #111111;
}

.checkout-total__amount-secondary {
  font-size: 0.9rem;
  font-weight: 600;
  color: #999999;
}

/* Stacked in the left column; a row of buttons when there's one column. */
.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.payment-method {
  min-height: 48px;
  padding: 0 0.75rem;
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
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #ffffff;
}

.qr-banks {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.qr-banks__label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #777777;
}

.qr-banks__options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.5rem;
}

.tender-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tendered-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.tendered-display__label {
  font-weight: 600;
  font-size: 0.95rem;
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
  width: 130px;
  min-height: 44px;
  border: 2px solid #dcdcdc;
  border-radius: 10px;
  padding: 0.25rem 0.6rem;
  font-size: 1.2rem;
  font-weight: 700;
  text-align: right;
}

/* As many columns as fit: four in the wide layout, so each currency's
   buttons take two rows. */
.fast-cash {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 0.5rem;
}

.fast-cash__button {
  min-height: 48px;
  padding: 0 0.25rem;
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
  order: 3;
  align-self: flex-end;
  border: none;
  background: transparent;
  color: #888888;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 0.25rem 0;
}

.change-banner {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: #e6f6ec;
  color: #1c7a41;
  font-weight: 700;
  font-size: 1.05rem;
  text-align: center;
}

.change-banner--warning {
  background: #fbe9e7;
  color: #c0392b;
}

.checkout-modal__complete {
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid var(--color-primary);
  background: var(--color-primary);
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

.checkout-print {
  margin: -0.75rem 0 1.25rem;
  color: #888888;
  font-size: 0.85rem;
}

.checkout-print--warning {
  color: #c0392b;
  font-weight: 600;
}

/* Narrow screens: one column - total, methods (now a row), tender details,
   then change + Complete pinned under them while the details scroll. */
@media (max-width: 700px) {
  .checkout-pay {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    grid-template-areas:
      "total"
      "methods"
      "detail"
      "footer";
  }

  .checkout-total {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.5rem;
  }

  .checkout-total__label {
    flex-basis: 100%;
  }

  .payment-methods {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
  }

  .checkout-pay__detail {
    padding-left: 0;
    border-left: none;
  }
}

/* Short screens (e.g. 1024x600 or 800x600): smaller targets and gaps so the
   whole payment step fits without scrolling. */
@media (max-height: 640px) {
  .checkout-pay {
    gap: 0.5rem 1rem;
    padding: 0.75rem 1rem 1rem;
  }

  .checkout-total {
    padding: 0.5rem 0.75rem;
  }

  .checkout-total__amount {
    font-size: 1.6rem;
  }

  .payment-method,
  .fast-cash__button {
    min-height: 42px;
  }

  .checkout-pay__detail,
  .tender-section {
    gap: 0.5rem;
  }

  .tendered-display__input-wrap input {
    min-height: 40px;
  }

  .change-banner {
    padding: 0.5rem 0.75rem;
  }

  .checkout-modal__complete {
    min-height: 46px;
  }
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity, so they override light styles
   exactly as the prefers-color-scheme media query used to. */
:where(:root[data-theme="dark"]) .checkout-modal {
  background: #242424;
}

:where(:root[data-theme="dark"]) .checkout-total {
  background: #2f2f2f;
}

:where(:root[data-theme="dark"]) .checkout-total__amount {
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .checkout-total__amount-secondary {
  color: #777777;
}

:where(:root[data-theme="dark"]) .checkout-total__label {
  color: #aaaaaa;
}

:where(:root[data-theme="dark"]) .checkout-pay__detail {
  border-left-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .change-banner {
  background: #1f3a2a;
  color: #7ddc9c;
}

:where(:root[data-theme="dark"]) .change-banner--warning {
  background: #4a2420;
  color: #ff9d8f;
}

:where(:root[data-theme="dark"]) .checkout-pay__note {
  background: #2f2f2f;
  color: #bbbbbb;
}

:where(:root[data-theme="dark"]) .payment-method {
  background: #2a2a2a;
  border-color: #444444;
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .payment-method--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary);
}

:where(:root[data-theme="dark"]) .tendered-display__label {
  color: #dddddd;
}

:where(:root[data-theme="dark"]) .tendered-display__input-wrap input {
  background: #2a2a2a;
  border-color: #444444;
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .fast-cash__button {
  background: #2a2a2a;
  border-color: #444444;
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .checkout-modal__cancel {
  background: #2a2a2a;
  border-color: #444444;
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .checkout-modal__complete {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary);
}

:where(:root[data-theme="dark"]) .checkout-modal__complete:disabled {
  opacity: 0.35;
}
</style>
