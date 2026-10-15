<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { MainCurrency } from "~/types/settings";

const { t } = useI18n();
const auth = useAuth();
const store = useSettingsStore();
const { formatRiel } = useCurrency();

const CURRENCIES: MainCurrency[] = ["USD", "KHR"];

// Mirrors isDirty up to app.vue so it can confirm before switching tabs or logging out.
const dirty = defineModel<boolean>("dirty", { default: false });

// Edits are held locally as a draft and only sent to the API when "Save Changes" is clicked.
const draftCurrency = ref<MainCurrency>(store.mainCurrency);
const draftTaxEnabled = ref(store.taxEnabled);
// v-model on a type="number" input writes back a number, or "" when the field is cleared.
const rateInput = ref<string | number>(String(store.exchangeRateRielPerUsd));

const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref(false);

function resetDraft() {
  draftCurrency.value = store.mainCurrency;
  draftTaxEnabled.value = store.taxEnabled;
  rateInput.value = String(store.exchangeRateRielPerUsd);
}

onMounted(async () => {
  await store.fetchExchangeRate();
  resetDraft();
});

const parsedRate = computed(() => Number(rateInput.value));
const rateError = computed(() => {
  if (String(rateInput.value).trim().length === 0 || !Number.isFinite(parsedRate.value) || parsedRate.value <= 0) {
    return t("settings.rateError");
  }
  return null;
});

const previewRiel = computed(() => (rateError.value ? null : formatRiel(parsedRate.value)));

const isCurrencyDirty = computed(() => draftCurrency.value !== store.mainCurrency);
const isTaxDirty = computed(() => draftTaxEnabled.value !== store.taxEnabled);
const isRateDirty = computed(() => String(rateInput.value) !== String(store.exchangeRateRielPerUsd));
const isDirty = computed(() => isCurrencyDirty.value || isTaxDirty.value || isRateDirty.value);
const canSubmit = computed(() => isDirty.value && !rateError.value && !isSubmitting.value);

watch(isDirty, (value) => {
  dirty.value = value;
});

// In-app navigation is guarded by app.vue; this covers reloading or closing the browser tab.
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (isDirty.value) {
    event.preventDefault();
  }
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
  dirty.value = false;
});

function markEdited() {
  successMessage.value = false;
  errorMessage.value = null;
}

function selectMainCurrency(currency: MainCurrency) {
  draftCurrency.value = currency;
  markEdited();
}

function toggleTaxEnabled() {
  draftTaxEnabled.value = !draftTaxEnabled.value;
  markEdited();
}

function discard() {
  resetDraft();
  markEdited();
}

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

  // Each setting has its own endpoint, so only the changed ones are sent. If one fails,
  // the ones already saved stay saved and the rest remain as unsaved changes in the draft.
  try {
    if (isCurrencyDirty.value) {
      await store.updateMainCurrency(draftCurrency.value, token);
    }
    if (isTaxDirty.value) {
      await store.updateTaxEnabled(draftTaxEnabled.value, token);
    }
    if (isRateDirty.value) {
      await store.updateExchangeRate(parsedRate.value, token);
    }
    successMessage.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("settings.saveError");
  } finally {
    isSubmitting.value = false;
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
          :disabled="isSubmitting"
          class="rounded-lg border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          :class="
            draftCurrency === currency
              ? 'border-primary bg-primary text-white'
              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          "
          @click="selectMainCurrency(currency)"
        >
          {{ currency === "USD" ? t("settings.currencyUsd") : t("settings.currencyKhr") }}
        </button>
      </div>
    </div>

    <div class="mt-5 max-w-md rounded-lg border border-slate-200 p-5">
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm font-medium text-slate-700">{{ t("settings.taxLabel") }}</label>
          <p class="mt-1 text-xs text-slate-500">{{ t("settings.taxHint") }}</p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="draftTaxEnabled"
          :disabled="isSubmitting"
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          :class="draftTaxEnabled ? 'bg-emerald-500' : 'bg-slate-300'"
          @click="toggleTaxEnabled"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="draftTaxEnabled ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>
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
          :disabled="isSubmitting"
          @input="markEdited"
          class="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <span class="text-sm font-semibold text-slate-500">៛</span>
      </div>

      <p v-if="rateError" class="mt-2 text-xs font-medium text-red-600">{{ rateError }}</p>
      <p v-else-if="previewRiel" class="mt-2 text-xs text-slate-500">{{ t("settings.previewLabel", { amount: previewRiel }) }}</p>
    </div>

    <div class="mt-5 flex max-w-md flex-col gap-3">
      <p v-if="errorMessage" class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{{ errorMessage }}</p>
      <p v-else-if="successMessage" class="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
        {{ t("settings.saveSuccess") }}
      </p>
      <p v-else-if="isDirty" class="text-xs font-medium text-amber-700">{{ t("settings.unsavedChanges") }}</p>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          :disabled="!isDirty || isSubmitting"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          @click="discard"
        >
          {{ t("settings.discardChanges") }}
        </button>
        <button
          type="button"
          :disabled="!canSubmit"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          {{ isSubmitting ? t("common.saving") : t("common.saveChanges") }}
        </button>
      </div>
    </div>
  </div>
</template>
