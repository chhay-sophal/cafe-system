<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { MainCurrency } from "~/types/settings";

const { t } = useI18n();
const auth = useAuth();
const store = useSettingsStore();
const { formatRiel } = useCurrency();

const CURRENCIES: MainCurrency[] = ["USD", "KHR"];

const rateInput = ref("");
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref(false);

const isCurrencySubmitting = ref(false);
const currencyErrorMessage = ref<string | null>(null);
const currencySuccessMessage = ref(false);

onMounted(async () => {
  await store.fetchExchangeRate();
  rateInput.value = String(store.exchangeRateRielPerUsd);
});

const parsedRate = computed(() => Number(rateInput.value));
const rateError = computed(() => {
  if (rateInput.value.trim().length === 0 || !Number.isFinite(parsedRate.value) || parsedRate.value <= 0) {
    return t("settings.rateError");
  }
  return null;
});
const canSubmit = computed(() => !rateError.value && !isSubmitting.value);

const previewRiel = computed(() => (rateError.value ? null : formatRiel(parsedRate.value)));

async function submit() {
  if (!canSubmit.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    errorMessage.value = t("common.sessionExpired");
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;
  successMessage.value = false;

  try {
    await store.updateExchangeRate(parsedRate.value, token);
    successMessage.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("settings.saveError");
  } finally {
    isSubmitting.value = false;
  }
}

async function selectMainCurrency(currency: MainCurrency) {
  if (currency === store.mainCurrency || isCurrencySubmitting.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    currencyErrorMessage.value = t("common.sessionExpired");
    return;
  }

  isCurrencySubmitting.value = true;
  currencyErrorMessage.value = null;
  currencySuccessMessage.value = false;

  try {
    await store.updateMainCurrency(currency, token);
    currencySuccessMessage.value = true;
  } catch (error) {
    currencyErrorMessage.value = error instanceof Error ? error.message : t("settings.mainCurrencySaveError");
  } finally {
    isCurrencySubmitting.value = false;
  }
}
</script>

<template>
  <div>
    <h2 class="mb-4 text-sm font-semibold text-slate-700">{{ t("settings.heading") }}</h2>

    <div class="max-w-md rounded-lg border border-slate-200 p-5">
      <label class="block text-sm font-medium text-slate-700">{{ t("settings.mainCurrencyLabel") }}</label>
      <p class="mt-1 text-xs text-slate-500">{{ t("settings.mainCurrencyHint") }}</p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          v-for="currency in CURRENCIES"
          :key="currency"
          type="button"
          :disabled="isCurrencySubmitting"
          class="rounded-lg border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          :class="
            store.mainCurrency === currency
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          "
          @click="selectMainCurrency(currency)"
        >
          {{ currency === "USD" ? t("settings.currencyUsd") : t("settings.currencyKhr") }}
        </button>
      </div>

      <p v-if="currencyErrorMessage" class="mt-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
        {{ currencyErrorMessage }}
      </p>
      <p v-else-if="currencySuccessMessage" class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
        {{ t("settings.mainCurrencySaveSuccess") }}
      </p>
    </div>

    <div class="mt-5 max-w-md rounded-lg border border-slate-200 p-5">
      <label class="block text-sm font-medium text-slate-700">{{ t("settings.exchangeRateLabel") }}</label>
      <p class="mt-1 text-xs text-slate-500">{{ t("settings.exchangeRateHint") }}</p>

      <div class="mt-2 flex items-center gap-2">
        <span class="text-sm font-semibold text-slate-500">1 USD =</span>
        <input
          v-model="rateInput"
          type="number"
          min="0"
          step="1"
          class="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <span class="text-sm font-semibold text-slate-500">៛</span>
      </div>

      <p v-if="rateError" class="mt-2 text-xs font-medium text-red-600">{{ rateError }}</p>
      <p v-else-if="previewRiel" class="mt-2 text-xs text-slate-500">{{ t("settings.previewLabel", { amount: previewRiel }) }}</p>

      <p v-if="errorMessage" class="mt-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{{ errorMessage }}</p>
      <p v-else-if="successMessage" class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
        {{ t("settings.saveSuccess") }}
      </p>

      <button
        type="button"
        :disabled="!canSubmit"
        class="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        @click="submit"
      >
        {{ isSubmitting ? t("common.saving") : t("common.saveChanges") }}
      </button>
    </div>
  </div>
</template>
