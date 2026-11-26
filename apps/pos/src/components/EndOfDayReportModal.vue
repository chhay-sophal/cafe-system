<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "../composables/useAuth";
import { useExchangeRate } from "../composables/useExchangeRate";
import { useOfflineQueue } from "../composables/useOfflineQueue";
import { useReceiptPrinter } from "../composables/useReceiptPrinter";
import { fetchEndOfDayReport } from "../lib/api";
import { buildEndOfDayReceipt } from "../lib/endOfDayReceipt";
import { loadReceiptFonts, PAPER_WIDTH_DOTS, renderReceiptPreview, type ReceiptBlock } from "../lib/receipt";
import type { EndOfDayReport } from "../types/order";

// The cashier's end-of-day report: loaded from the server, previewed exactly
// as it will print, then printed on the receipt printer. Managers and admins
// can switch to the whole store's day.
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n({ useScope: "global" });
const auth = useAuth();
const { exchangeRateRielPerUsd, mainCurrency } = useExchangeRate();
const offlineQueue = useOfflineQueue();
const receiptPrinter = useReceiptPrinter();

type Scope = "mine" | "all";
const canSeeStore = computed(() => ["MANAGER", "ADMIN"].includes(auth.session.value?.user.role ?? ""));

function todayString(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const date = ref(todayString());
const scope = ref<Scope>("mine");
const report = ref<EndOfDayReport | null>(null);
const isLoading = ref(false);
const loadError = ref<string | null>(null);
const previewUrl = ref<string | null>(null);
const previewWidthPx = computed(() => PAPER_WIDTH_DOTS[receiptPrinter.paperSize.value]);

const printStatus = ref<"idle" | "printing" | "printed" | "failed">("idle");
const printError = ref<string | null>(null);

// Queued offline sales of this register aren't on the server yet - the
// printout says so (only for today, the day they belong to).
const unsyncedCount = computed(() => (date.value === todayString() ? offlineQueue.pendingCount.value : 0));

function blocks(): ReceiptBlock[] | null {
  return report.value
    ? buildEndOfDayReceipt(report.value, {
      mainCurrency: mainCurrency.value,
      exchangeRateRielPerUsd: exchangeRateRielPerUsd.value,
      unsyncedCount: unsyncedCount.value,
    })
    : null;
}

async function load() {
  const token = auth.session.value?.token;
  if (!token || !date.value) {
    return;
  }
  isLoading.value = true;
  loadError.value = null;
  printStatus.value = "idle";
  try {
    report.value = await fetchEndOfDayReport(token, date.value, scope.value);
  } catch (error) {
    report.value = null;
    loadError.value = error instanceof Error ? error.message : t("endOfDay.loadError");
  } finally {
    isLoading.value = false;
  }
}

async function refreshPreview() {
  const receipt = blocks();
  if (!receipt) {
    previewUrl.value = null;
    return;
  }
  await loadReceiptFonts();
  previewUrl.value = renderReceiptPreview(
    receipt,
    receiptPrinter.paperSize.value,
    receiptPrinter.bottomMarginMm.value,
    window.devicePixelRatio || 1,
  ).toDataURL("image/png");
}

async function print() {
  const receipt = blocks();
  if (!receipt || printStatus.value === "printing") {
    return;
  }
  printStatus.value = "printing";
  printError.value = null;
  try {
    await receiptPrinter.printReceipt(receipt);
    printStatus.value = "printed";
  } catch (error) {
    // Rust command errors arrive as plain strings, not Error objects.
    printError.value = error instanceof Error ? error.message : String(error);
    printStatus.value = "failed";
  }
}

watch([date, scope], load);
watch([report, receiptPrinter.paperSize, receiptPrinter.bottomMarginMm, unsyncedCount], refreshPreview);
onMounted(load);
</script>

<template>
  <div class="eod-backdrop" @click.self="emit('close')">
    <div class="eod-modal" role="dialog" aria-modal="true" :aria-label="t('endOfDay.heading')">
      <header class="eod-modal__header">
        <h2>{{ t("endOfDay.heading") }}</h2>
        <button type="button" class="eod-modal__close" :aria-label="t('common.close')" @click="emit('close')">&times;</button>
      </header>

      <div class="eod-modal__controls">
        <label class="eod-field">
          <span>{{ t("endOfDay.date") }}</span>
          <input v-model="date" type="date" :max="todayString()" class="eod-input" />
        </label>
        <div v-if="canSeeStore" class="eod-choice" role="radiogroup" :aria-label="t('endOfDay.scope')">
          <button
            v-for="option in (['mine', 'all'] as const)"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="scope === option"
            class="eod-choice__option"
            :class="{ 'eod-choice__option--active': scope === option }"
            @click="scope = option"
          >
            {{ option === "mine" ? t("endOfDay.scopeMine") : t("endOfDay.scopeAll") }}
          </button>
        </div>
      </div>

      <div class="eod-modal__paper-area">
        <p v-if="isLoading" class="eod-modal__muted">{{ t("endOfDay.loading") }}</p>
        <div v-else-if="loadError" class="eod-modal__centered">
          <p class="eod-modal__error">{{ loadError }}</p>
          <button type="button" class="eod-button" @click="load">{{ t("common.tryAgain") }}</button>
        </div>
        <img
          v-else-if="previewUrl"
          :src="previewUrl"
          :alt="t('endOfDay.heading')"
          class="eod-modal__paper"
          :style="{ width: `${previewWidthPx}px` }"
        />
      </div>

      <footer class="eod-modal__footer">
        <p v-if="!receiptPrinter.printerName.value" class="eod-modal__status eod-modal__status--warning">{{ t("receipt.noPrinter") }}</p>
        <p v-else-if="printStatus === 'printed'" class="eod-modal__status">{{ t("receipt.printed") }}</p>
        <p v-else-if="printStatus === 'failed'" class="eod-modal__status eod-modal__status--warning">
          {{ t("receipt.failed", { error: printError }) }}
        </p>
        <button type="button" class="eod-button" @click="emit('close')">{{ t("common.close") }}</button>
        <button
          type="button"
          class="eod-button eod-button--primary"
          :disabled="!report || !receiptPrinter.printerName.value || printStatus === 'printing'"
          @click="print"
        >
          {{ printStatus === "printing" ? t("receipt.printing") : t("endOfDay.print") }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.eod-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.eod-modal {
  width: 100%;
  max-width: 640px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.eod-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: var(--color-primary);
  color: #ffffff;
}

.eod-modal__header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.eod-modal__close {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.eod-modal__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #eeeeee;
}

.eod-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #777777;
}

.eod-input {
  min-height: 44px;
  padding: 0 0.75rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 0.95rem;
}

.eod-choice {
  display: flex;
  border: 2px solid #dcdcdc;
  border-radius: 10px;
  overflow: hidden;
}

.eod-choice__option {
  min-height: 40px;
  padding: 0 1rem;
  border: none;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.eod-choice__option--active {
  background: var(--color-primary);
  color: #ffffff;
}

.eod-modal__paper-area {
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 1.25rem;
  background: #f1f1f1;
}

.eod-modal__paper {
  max-width: 100%;
  height: auto;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

.eod-modal__centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin: auto;
}

.eod-modal__muted {
  margin: auto;
  color: #888888;
}

.eod-modal__error {
  margin: 0;
  color: #c0392b;
  font-weight: 600;
  text-align: center;
}

.eod-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid #eeeeee;
}

.eod-modal__status {
  margin: 0 auto 0 0;
  color: #777777;
  font-size: 0.85rem;
}

.eod-modal__status--warning {
  color: #c0392b;
  font-weight: 600;
}

.eod-button {
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.eod-button--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.eod-button:disabled {
  opacity: 0.5;
  cursor: default;
}

:where(:root[data-theme="dark"]) .eod-modal,
:where(:root[data-theme="dark"]) .eod-button,
:where(:root[data-theme="dark"]) .eod-input,
:where(:root[data-theme="dark"]) .eod-choice__option:not(.eod-choice__option--active) {
  background: #242424;
  color: #f6f6f6;
  border-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .eod-modal__paper-area {
  background: #1a1a1a;
}

:where(:root[data-theme="dark"]) .eod-modal__controls,
:where(:root[data-theme="dark"]) .eod-modal__footer {
  border-color: #3a3a3a;
}
</style>
