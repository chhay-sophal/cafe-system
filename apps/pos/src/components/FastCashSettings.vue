<script setup lang="ts">
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { useExchangeRate } from "../composables/useExchangeRate";
import {
  FAST_CASH_MAX_BUTTONS,
  formatFastCashLabel,
  useFastCash,
  type FastCashAddError,
  type FastCashCurrency,
} from "../composables/useFastCash";

const { t } = useI18n({ useScope: "global" });
const { mainCurrency } = useExchangeRate();
const fastCash = useFastCash();

// Main currency first, the same order checkout shows the tender fields in.
const currencies = computed<FastCashCurrency[]>(() => (mainCurrency.value === "KHR" ? ["KHR", "USD"] : ["USD", "KHR"]));

const drafts = reactive<Record<FastCashCurrency, string>>({ USD: "", KHR: "" });
const errors = reactive<Record<FastCashCurrency, FastCashAddError | null>>({ USD: null, KHR: null });

function handleAdd(currency: FastCashCurrency) {
  if (drafts[currency].trim() === "") {
    return;
  }
  errors[currency] = fastCash.addAmount(currency, Number(drafts[currency]));
  if (!errors[currency]) {
    drafts[currency] = "";
  }
}

function handleDraftInput(currency: FastCashCurrency, value: string) {
  drafts[currency] = value;
  errors[currency] = null;
}
</script>

<template>
  <div v-for="currency in currencies" :key="currency" class="fast-cash-settings">
    <div class="fast-cash-settings__head">
      <div class="fast-cash-settings__text">
        <span class="fast-cash-settings__label">{{ t(`settings.payments.fastCash.heading.${currency}`) }}</span>
        <span class="fast-cash-settings__hint">
          {{ t("settings.payments.fastCash.hint", { max: FAST_CASH_MAX_BUTTONS }) }}
        </span>
      </div>
      <button
        type="button"
        class="fast-cash-settings__reset"
        :disabled="fastCash.isDefault(currency)"
        @click="fastCash.resetAmounts(currency)"
      >
        {{ t("settings.payments.fastCash.reset") }}
      </button>
    </div>

    <p v-if="fastCash.amounts[currency].value.length === 0" class="fast-cash-settings__empty">
      {{ t("settings.payments.fastCash.empty") }}
    </p>
    <ul v-else class="fast-cash-settings__chips">
      <li v-for="amount in fastCash.amounts[currency].value" :key="amount" class="fast-cash-settings__chip">
        <span>{{ formatFastCashLabel(currency, amount) }}</span>
        <button
          type="button"
          class="fast-cash-settings__remove"
          :aria-label="t('settings.payments.fastCash.remove', { amount: formatFastCashLabel(currency, amount) })"
          :title="t('settings.payments.fastCash.remove', { amount: formatFastCashLabel(currency, amount) })"
          @click="fastCash.removeAmount(currency, amount)"
        >
          &times;
        </button>
      </li>
    </ul>

    <form class="fast-cash-settings__add" @submit.prevent="handleAdd(currency)">
      <span class="fast-cash-settings__unit">{{ currency === "KHR" ? "៛" : "$" }}</span>
      <input
        v-numeric
        type="text"
        inputmode="decimal"
        :placeholder="currency === 'KHR' ? '5000' : '5'"
        :aria-label="t(`settings.payments.fastCash.heading.${currency}`)"
        :value="drafts[currency]"
        class="fast-cash-settings__input"
        @input="handleDraftInput(currency, ($event.target as HTMLInputElement).value)"
      />
      <button
        type="submit"
        class="fast-cash-settings__add-button"
        :disabled="drafts[currency].trim() === '' || fastCash.amounts[currency].value.length >= FAST_CASH_MAX_BUTTONS"
      >
        {{ t("settings.payments.fastCash.add") }}
      </button>
    </form>
    <p v-if="errors[currency]" class="fast-cash-settings__error">
      {{ t(`settings.payments.fastCash.errors.${errors[currency]}.${currency}`, { max: FAST_CASH_MAX_BUTTONS }) }}
    </p>
  </div>
</template>

<style scoped>
.fast-cash-settings {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
}

.fast-cash-settings__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.fast-cash-settings__text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.fast-cash-settings__label {
  font-weight: 700;
}

.fast-cash-settings__hint,
.fast-cash-settings__empty {
  margin: 0;
  font-size: 0.85rem;
  color: #777777;
}

.fast-cash-settings__reset {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #777777;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 0.25rem 0;
}

.fast-cash-settings__reset:disabled {
  opacity: 0.4;
  cursor: default;
}

.fast-cash-settings__chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.fast-cash-settings__chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 40px;
  padding: 0 0.25rem 0 0.85rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  font-weight: 700;
}

.fast-cash-settings__remove {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #999999;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.fast-cash-settings__remove:hover {
  background: #fbe9e7;
  color: #c0392b;
}

.fast-cash-settings__add {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.fast-cash-settings__unit {
  font-weight: 700;
  color: #555555;
}

.fast-cash-settings__input {
  width: 140px;
  min-height: 44px;
  padding: 0 0.75rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
}

.fast-cash-settings__add-button {
  min-height: 44px;
  padding: 0 1.1rem;
  border-radius: 10px;
  border: none;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.fast-cash-settings__add-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.fast-cash-settings__error {
  margin: 0;
  color: #c0392b;
  font-size: 0.9rem;
  font-weight: 600;
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity. */
:where(:root[data-theme="dark"]) .fast-cash-settings {
  background: #242424;
  border-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .fast-cash-settings__chip {
  border-color: #444444;
}

:where(:root[data-theme="dark"]) .fast-cash-settings__remove:hover {
  background: #4a2420;
  color: #ff9d8f;
}

:where(:root[data-theme="dark"]) .fast-cash-settings__unit {
  color: #bbbbbb;
}

:where(:root[data-theme="dark"]) .fast-cash-settings__input {
  background: #2e2e2e;
  border-color: #3a3a3a;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .fast-cash-settings__error {
  color: #ff8a7a;
}
</style>
