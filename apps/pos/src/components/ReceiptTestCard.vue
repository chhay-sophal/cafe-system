<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "../composables/useAuth";
import { useExchangeRate } from "../composables/useExchangeRate";
import { useReceiptPrinter } from "../composables/useReceiptPrinter";
import { useStoreName } from "../composables/useStoreName";
import { formatMain, formatSecondary } from "../lib/currency";
import {
  formatReceiptDate,
  loadReceiptFonts,
  PAPER_WIDTH_DOTS,
  renderReceiptPreview,
  type ReceiptBlock,
} from "../lib/receipt";

const { t, locale } = useI18n({ useScope: "global" });
const { storeName } = useStoreName();
const auth = useAuth();
const { exchangeRateRielPerUsd, mainCurrency } = useExchangeRate();
const receiptPrinter = useReceiptPrinter();

type TestStatus = "idle" | "printing" | "printed" | "failed";

const previewUrl = ref<string | null>(null);
// Shown one CSS pixel per printer dot, so 58mm paper looks narrower than
// 80mm, as on the real roll.
const previewWidthPx = computed(() => PAPER_WIDTH_DOTS[receiptPrinter.paperSize.value]);
const status = ref<TestStatus>("idle");
const printError = ref<string | null>(null);

function format(value: number): string {
  return formatMain(value, mainCurrency.value, exchangeRateRielPerUsd.value);
}

// A made-up sale laid out like CheckoutModal's real receipts, with item names
// in the current language - in Khmer it also proves the printer reproduces
// Khmer script, which comes out as a picture, not printer text.
function buildTestBlocks(): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [
    { type: "text", text: storeName.value, align: "center", size: "large", bold: true },
    { type: "text", text: formatReceiptDate(new Date()), align: "center", size: "small" },
    { type: "text", text: t("settings.printer.test.label"), align: "center", bold: true },
  ];

  const cashierName = auth.session.value?.user.name;
  if (cashierName) {
    blocks.push({ type: "text", text: t("receipt.cashier", { name: cashierName }), align: "center", size: "small" });
  }

  blocks.push(
    { type: "divider" },
    { type: "row", left: `2 x ${t("settings.printer.test.item1")}`, right: format(5) },
    { type: "text", text: `+ ${t("settings.printer.test.modifier")}`, size: "small", indent: 24 },
    { type: "row", left: `1 x ${t("settings.printer.test.item2")}`, right: format(1.75) },
    { type: "divider" },
    { type: "row", left: t("cart.subtotal"), right: format(6.75) },
    { type: "row", left: t("cart.total"), right: format(6.75), size: "large", bold: true },
    { type: "row", left: "", right: formatSecondary(6.75, mainCurrency.value, exchangeRateRielPerUsd.value), size: "small" },
    { type: "spacer", height: 12 },
    { type: "text", text: t("receipt.thankYou"), align: "center" },
  );
  return blocks;
}

// Re-rendered whenever something that changes the printout does. The
// Khmer/Latin font files load on first use, so wait for them or the canvas
// silently falls back to a system font.
async function refreshPreview() {
  await loadReceiptFonts();
  // Drawn at the screen's pixel density (e.g. 1.5 at 150% Windows scaling),
  // so the text is as sharp as the rest of the UI instead of upscaled.
  const canvas = renderReceiptPreview(
    buildTestBlocks(),
    receiptPrinter.paperSize.value,
    receiptPrinter.bottomMarginMm.value,
    window.devicePixelRatio || 1,
  );
  previewUrl.value = canvas.toDataURL("image/png");
}

watch(
  [receiptPrinter.paperSize, receiptPrinter.bottomMarginMm, locale, storeName, mainCurrency, exchangeRateRielPerUsd],
  refreshPreview,
  { immediate: true },
);

const canPrint = computed(() => receiptPrinter.printerName.value !== null && status.value !== "printing");

async function printTest() {
  if (!canPrint.value) {
    return;
  }

  status.value = "printing";
  printError.value = null;
  try {
    await receiptPrinter.printReceipt(buildTestBlocks());
    status.value = "printed";
  } catch (error) {
    // Rust command errors arrive as plain strings, not Error objects.
    printError.value = error instanceof Error ? error.message : String(error);
    status.value = "failed";
  }
}
</script>

<template>
  <div class="receipt-test">
    <div class="receipt-test__info">
      <span class="receipt-test__label">{{ t("settings.printer.test.heading") }}</span>
      <span class="receipt-test__hint">{{ t("settings.printer.test.hint") }}</span>

      <button type="button" class="receipt-test__print" :disabled="!canPrint" @click="printTest">
        {{ status === "printing" ? t("settings.printer.test.printing") : t("settings.printer.test.print") }}
      </button>

      <p v-if="!receiptPrinter.printerName.value" class="receipt-test__status">
        {{ t("settings.printer.test.noPrinter") }}
      </p>
      <p v-else-if="status === 'printed'" class="receipt-test__status receipt-test__status--ok">
        {{ t("settings.printer.test.printed") }}
      </p>
      <p v-else-if="status === 'failed'" class="receipt-test__status receipt-test__status--error">
        {{ t("receipt.failed", { error: printError }) }}
      </p>
    </div>

    <div class="receipt-test__paper-area">
      <img
        v-if="previewUrl"
        :src="previewUrl"
        :alt="t('settings.printer.test.previewAlt')"
        class="receipt-test__paper"
        :style="{ width: `${previewWidthPx}px` }"
      />
    </div>
  </div>
</template>

<style scoped>
.receipt-test {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
}

.receipt-test__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.receipt-test__label {
  font-weight: 700;
}

.receipt-test__hint {
  font-size: 0.85rem;
  color: #777777;
}

.receipt-test__print {
  margin-top: 0.5rem;
  min-height: 44px;
  padding: 0 1.25rem;
  border-radius: 10px;
  border: none;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.receipt-test__print:disabled {
  opacity: 0.4;
  cursor: default;
}

.receipt-test__status {
  margin: 0;
  font-size: 0.9rem;
  color: #777777;
}

.receipt-test__status--ok {
  color: #1e8e4e;
  font-weight: 600;
}

.receipt-test__status--error {
  color: #c0392b;
  font-weight: 600;
}

.receipt-test__paper-area {
  flex-shrink: 0;
  max-width: 60%;
  max-height: 520px;
  overflow: auto;
  padding: 1rem;
  border-radius: 10px;
  background: #e9e9e9;
}

.receipt-test__paper {
  display: block;
  max-width: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity. The paper itself stays white -
   it shows the real printout. */
:where(:root[data-theme="dark"]) .receipt-test {
  background: #242424;
  border-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .receipt-test__paper-area {
  background: #2e2e2e;
}

:where(:root[data-theme="dark"]) .receipt-test__status--ok {
  color: #6fd08c;
}

:where(:root[data-theme="dark"]) .receipt-test__status--error {
  color: #ff8a7a;
}
</style>
