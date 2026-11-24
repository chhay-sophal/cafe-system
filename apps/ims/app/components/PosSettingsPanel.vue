<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, type Ref } from "vue";
import { Trash2 } from "@lucide/vue";
import type { PosPaymentMethod, PosSettings, PosSocialPlatform } from "~/types/settings";

// The store-wide POS settings, shared with the register's own Settings tab -
// either side can change them; the register picks up changes from here when
// it next loads the menu (start, login, Refresh menu). Each section saves on
// its own so it can't overwrite a different section changed on the register.

const { t } = useI18n();
const store = usePosSettingsStore();
const { formatRiel } = useCurrency();

onMounted(() => store.ensureFresh());

const settings = computed(() => store.response?.settings ?? null);

// Limits match the POS (and the backend's posSettingsSchema).
const STORE_NAME_MAX = 60;
const ADDRESS_MAX = 200;
const CONTACT_MAX_LENGTH = 60;
const CONTACT_MAX_ENTRIES = 3;
const FAST_CASH_MAX = 10;
const KHQR_MAX = 10;
const PAYMENT_METHODS: PosPaymentMethod[] = ["CASH", "CARD", "QR_CODE"];
const SOCIAL_PLATFORMS: PosSocialPlatform[] = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "TELEGRAM", "WEBSITE", "OTHER"];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// A section's editable copy of the saved settings, with its own Save. The
// copy follows the saved settings until it's edited.
function useSection<T>(pick: (saved: PosSettings) => T, toUpdate: (draft: T) => Partial<PosSettings>) {
  const draft = ref(null) as Ref<T | null>;
  const isSaving = ref(false);
  const error = ref<string | null>(null);
  const justSaved = ref(false);
  const isDirty = computed(
    () => draft.value !== null && settings.value !== null && JSON.stringify(draft.value) !== JSON.stringify(pick(settings.value)),
  );

  watch(
    settings,
    (saved) => {
      if (saved && !isDirty.value) {
        draft.value = clone(pick(saved));
      }
    },
    { immediate: true },
  );

  async function save() {
    if (!draft.value || !isDirty.value || isSaving.value) return;
    isSaving.value = true;
    error.value = null;
    try {
      await store.save(toUpdate(draft.value));
      draft.value = clone(pick(settings.value!));
      justSaved.value = true;
      setTimeout(() => (justSaved.value = false), 2500);
    } catch (saveError) {
      error.value = saveError instanceof Error ? saveError.message : t("posSettings.saveError");
    } finally {
      isSaving.value = false;
    }
  }

  function discard() {
    if (settings.value) draft.value = clone(pick(settings.value));
    error.value = null;
  }

  return reactive({ draft, isDirty, isSaving, error, justSaved, save, discard });
}

// --- Store name & details -------------------------------------------------

const storeSection = useSection(
  (saved) => ({ storeName: saved.storeName, ...saved.storeDetails }),
  (draft) => ({
    storeName: draft.storeName.trim(),
    storeDetails: {
      // Trimmed lines, blank ones dropped - as the POS saves it.
      address: draft.address.split("\n").map((line) => line.trim()).filter(Boolean).join("\n"),
      phones: draft.phones,
      emails: draft.emails,
      socials: draft.socials,
    },
  }),
);

const newPhone = ref("");
const newEmail = ref("");
const newSocialPlatform = ref<PosSocialPlatform>("FACEBOOK");
const newSocialHandle = ref("");
const contactError = ref<string | null>(null);

// Same loose checks as the POS: phone formats vary (+855 12 345 678,
// 012-345-678, (023) ...).
const isValidPhone = (value: string) => /^[+(\d][\d\s\-().]*$/.test(value) && value.replace(/\D/g, "").length >= 6;
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function addContact(list: "phones" | "emails") {
  const draft = storeSection.draft;
  if (!draft) return;
  const input = list === "phones" ? newPhone : newEmail;
  const entry = input.value.trim();
  const valid = list === "phones" ? isValidPhone(entry) : isValidEmail(entry);
  contactError.value = null;
  if (!valid || entry.length > CONTACT_MAX_LENGTH) {
    contactError.value = t(list === "phones" ? "posSettings.store.invalidPhone" : "posSettings.store.invalidEmail");
  } else if (draft[list].some((existing) => existing.toLowerCase() === entry.toLowerCase())) {
    contactError.value = t("posSettings.store.duplicate");
  } else if (draft[list].length >= CONTACT_MAX_ENTRIES) {
    contactError.value = t("posSettings.store.full", { count: CONTACT_MAX_ENTRIES });
  } else {
    draft[list].push(entry);
    input.value = "";
  }
}

function addSocial() {
  const draft = storeSection.draft;
  if (!draft) return;
  const handle = newSocialHandle.value.trim();
  contactError.value = null;
  if (handle === "" || handle.length > CONTACT_MAX_LENGTH) {
    contactError.value = t("posSettings.store.invalidSocial");
  } else if (draft.socials.length >= CONTACT_MAX_ENTRIES) {
    contactError.value = t("posSettings.store.full", { count: CONTACT_MAX_ENTRIES });
  } else {
    draft.socials.push({ platform: newSocialPlatform.value, handle });
    newSocialHandle.value = "";
  }
}

// --- Payments: methods and fast cash ---------------------------------------

const paymentsSection = useSection(
  (saved) => ({ paymentMethods: saved.paymentMethods, fastCash: saved.fastCash }),
  (draft) => ({ paymentMethods: PAYMENT_METHODS.filter((method) => draft.paymentMethods.includes(method)), fastCash: draft.fastCash }),
);

function toggleMethod(method: PosPaymentMethod) {
  const draft = paymentsSection.draft;
  if (!draft) return;
  const enabled = draft.paymentMethods.includes(method);
  // Checkout needs at least one way to take payment.
  if (enabled && draft.paymentMethods.length === 1) return;
  draft.paymentMethods = enabled ? draft.paymentMethods.filter((m) => m !== method) : [...draft.paymentMethods, method];
}

const newAmount = reactive({ USD: "" as string | number, KHR: "" as string | number });
const amountError = reactive({ USD: null as string | null, KHR: null as string | null });

function addAmount(currency: "USD" | "KHR") {
  const draft = paymentsSection.draft;
  if (!draft) return;
  const amount = Number(newAmount[currency]);
  const list = draft.fastCash[currency];
  // USD to the cent; riel in whole hundreds - the smallest note.
  const valid = Number.isFinite(amount) && amount > 0
    && (currency === "KHR" ? amount % 100 === 0 : Math.abs(Math.round(amount * 100) - amount * 100) < 1e-6);
  amountError[currency] = null;
  if (!valid) {
    amountError[currency] = t(currency === "KHR" ? "posSettings.payments.invalidRiel" : "posSettings.payments.invalidUsd");
  } else if (list.includes(amount)) {
    amountError[currency] = t("posSettings.store.duplicate");
  } else if (list.length >= FAST_CASH_MAX) {
    amountError[currency] = t("posSettings.store.full", { count: FAST_CASH_MAX });
  } else {
    draft.fastCash[currency] = [...list, amount].sort((a, b) => a - b);
    newAmount[currency] = "";
  }
}

function formatAmount(currency: "USD" | "KHR", amount: number): string {
  return currency === "KHR" ? formatRiel(amount) : `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

// --- Language ----------------------------------------------------------------

// Shown in their own script, like the register's language picker, so anyone
// can find theirs.
const LANGUAGES = [
  { value: "en-US", label: "English" },
  { value: "km-KH", label: "ខ្មែរ" },
] as const;

const languageSection = useSection(
  (saved) => ({ language: saved.language }),
  (draft) => ({ language: draft.language }),
);
const isLanguageUnset = computed(() => store.response?.unsetSections.includes("language") ?? false);

// --- Menu: unavailable items ----------------------------------------------------

const menuSection = useSection(
  (saved) => ({ hideUnavailableItems: saved.hideUnavailableItems }),
  (draft) => ({ hideUnavailableItems: draft.hideUnavailableItems }),
);
const isMenuUnset = computed(() => store.response?.unsetSections.includes("hideUnavailableItems") ?? false);

// --- KHQR banks (saved straight away, like on the register) ---------------

const newBankName = ref("");
const newBankFile = ref<File | null>(null);
const fileInputKey = ref(0);
const isSavingBank = ref(false);
const bankError = ref<string | null>(null);
const pendingRemoveId = ref<string | null>(null);
const banks = computed(() => settings.value?.khqrBanks ?? []);
const canAddBank = computed(
  () => newBankName.value.trim() !== "" && newBankFile.value !== null && banks.value.length < KHQR_MAX && !isSavingBank.value,
);

async function addBank() {
  if (!canAddBank.value || !newBankFile.value) return;
  isSavingBank.value = true;
  bankError.value = null;
  try {
    const { uploadProductImage } = useApi();
    const { url } = await uploadProductImage(newBankFile.value, useAuth().requireToken());
    await store.save({ khqrBanks: [...banks.value, { id: crypto.randomUUID(), name: newBankName.value.trim(), imageUrl: url }] });
    newBankName.value = "";
    newBankFile.value = null;
    fileInputKey.value += 1;
  } catch (error) {
    bankError.value = error instanceof Error ? error.message : t("posSettings.saveError");
  } finally {
    isSavingBank.value = false;
  }
}

async function removeBank(id: string) {
  isSavingBank.value = true;
  bankError.value = null;
  try {
    await store.save({ khqrBanks: banks.value.filter((bank) => bank.id !== id) });
    pendingRemoveId.value = null;
  } catch (error) {
    bankError.value = error instanceof Error ? error.message : t("posSettings.saveError");
  } finally {
    isSavingBank.value = false;
  }
}

// FIELD has no width, so each use sets its own - a width added on top of
// INPUT's w-full would lose to it (Tailwind's order, not the class order).
const FIELD = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const INPUT = `w-full ${FIELD}`;
// A text box sharing a row with an Add button: takes the room left over.
const ROW_INPUT = `min-w-0 flex-1 ${FIELD}`;
const CHIP = "inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700";
const SMALL_BUTTON = "shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <h2 class="text-lg font-bold text-slate-900">{{ t("posSettings.heading") }}</h2>
    <p class="mt-1 text-sm text-slate-500">{{ t("posSettings.intro") }}</p>

    <p v-if="store.error" class="mt-4 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ store.error }}</p>
    <p v-else-if="store.isLoading && !store.response" class="p-6 text-center text-sm text-slate-500">{{ t("posSettings.loading") }}</p>

    <template v-else-if="settings && storeSection.draft && paymentsSection.draft">
      <p v-if="!store.response?.configured" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        {{ t("posSettings.notConfigured") }}
      </p>

      <!-- Store name & details -->
      <section class="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 class="font-semibold text-slate-900">{{ t("posSettings.store.heading") }}</h3>
        <p class="text-xs text-slate-500">{{ t("posSettings.store.hint") }}</p>

        <label class="mt-4 block">
          <span class="text-sm font-medium text-slate-700">{{ t("posSettings.store.name") }}</span>
          <input v-model="storeSection.draft.storeName" :maxlength="STORE_NAME_MAX" :placeholder="t('posSettings.store.namePlaceholder')" :class="[INPUT, 'mt-1']" />
        </label>

        <label class="mt-4 block">
          <span class="text-sm font-medium text-slate-700">{{ t("posSettings.store.address") }}</span>
          <textarea v-model="storeSection.draft.address" rows="2" :maxlength="ADDRESS_MAX" :class="[INPUT, 'mt-1']" />
        </label>

        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div v-for="list in (['phones', 'emails'] as const)" :key="list">
            <span class="text-sm font-medium text-slate-700">{{ t(`posSettings.store.${list}`) }}</span>
            <div class="mt-1 flex flex-wrap gap-2">
              <span v-for="(entry, index) in storeSection.draft[list]" :key="entry" :class="CHIP">
                {{ entry }}
                <button type="button" class="text-slate-400 hover:text-red-600" :aria-label="t('posSettings.remove', { name: entry })" @click="storeSection.draft[list].splice(index, 1)">&times;</button>
              </span>
            </div>
            <div class="mt-2 flex gap-2">
              <input
                v-if="list === 'phones'"
                v-model="newPhone"
                type="tel"
                :placeholder="t('posSettings.store.phonePlaceholder')"
                :class="ROW_INPUT"
                @keydown.enter.prevent="addContact('phones')"
              />
              <input
                v-else
                v-model="newEmail"
                type="email"
                :placeholder="t('posSettings.store.emailPlaceholder')"
                :class="ROW_INPUT"
                @keydown.enter.prevent="addContact('emails')"
              />
              <button type="button" :class="SMALL_BUTTON" @click="addContact(list)">{{ t("posSettings.add") }}</button>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <span class="text-sm font-medium text-slate-700">{{ t("posSettings.store.socials") }}</span>
          <div class="mt-1 flex flex-wrap gap-2">
            <span v-for="(link, index) in storeSection.draft.socials" :key="`${link.platform}-${link.handle}`" :class="CHIP">
              {{ t(`posSettings.platforms.${link.platform}`) }}: {{ link.handle }}
              <button type="button" class="text-slate-400 hover:text-red-600" :aria-label="t('posSettings.remove', { name: link.handle })" @click="storeSection.draft.socials.splice(index, 1)">&times;</button>
            </span>
          </div>
          <div class="mt-2 flex flex-wrap gap-2 sm:flex-nowrap">
            <select v-model="newSocialPlatform" :class="[FIELD, 'w-full sm:w-36 sm:shrink-0']" :aria-label="t('posSettings.store.platform')">
              <option v-for="platform in SOCIAL_PLATFORMS" :key="platform" :value="platform">{{ t(`posSettings.platforms.${platform}`) }}</option>
            </select>
            <input v-model="newSocialHandle" :placeholder="t('posSettings.store.handlePlaceholder')" :class="ROW_INPUT" @keydown.enter.prevent="addSocial" />
            <button type="button" :class="SMALL_BUTTON" @click="addSocial">{{ t("posSettings.add") }}</button>
          </div>
        </div>
        <p v-if="contactError" class="mt-2 text-xs font-medium text-red-700">{{ contactError }}</p>

        <div class="mt-5 flex items-center justify-end gap-2">
          <p v-if="storeSection.error" class="mr-auto text-xs font-medium text-red-700">{{ storeSection.error }}</p>
          <p v-else-if="storeSection.justSaved" class="mr-auto text-xs font-medium text-emerald-700">{{ t("posSettings.saved") }}</p>
          <button v-if="storeSection.isDirty" type="button" :class="SMALL_BUTTON" @click="storeSection.discard()">{{ t("posSettings.discard") }}</button>
          <button
            type="button"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!storeSection.isDirty || storeSection.isSaving"
            @click="storeSection.save()"
          >
            {{ storeSection.isSaving ? t("common.saving") : t("common.save") }}
          </button>
        </div>
      </section>

      <!-- Payments -->
      <section class="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 class="font-semibold text-slate-900">{{ t("posSettings.payments.heading") }}</h3>

        <span class="mt-4 block text-sm font-medium text-slate-700">{{ t("posSettings.payments.methods") }}</span>
        <p class="text-xs text-slate-500">{{ t("posSettings.payments.methodsHint") }}</p>
        <div class="mt-2 flex flex-wrap gap-4">
          <label v-for="method in PAYMENT_METHODS" :key="method" class="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              class="h-4 w-4"
              :checked="paymentsSection.draft.paymentMethods.includes(method)"
              :disabled="paymentsSection.draft.paymentMethods.includes(method) && paymentsSection.draft.paymentMethods.length === 1"
              @change="toggleMethod(method)"
            />
            {{ t(`paymentBreakdown.methods.${method}`) }}
          </label>
        </div>

        <div v-for="currency in (['USD', 'KHR'] as const)" :key="currency" class="mt-5">
          <span class="text-sm font-medium text-slate-700">{{ t(`posSettings.payments.fastCash${currency}`) }}</span>
          <div class="mt-1 flex flex-wrap gap-2">
            <span v-if="paymentsSection.draft.fastCash[currency].length === 0" class="text-xs text-slate-400">{{ t("posSettings.payments.noButtons") }}</span>
            <span v-for="(amount, index) in paymentsSection.draft.fastCash[currency]" :key="amount" :class="CHIP">
              +{{ formatAmount(currency, amount) }}
              <button type="button" class="text-slate-400 hover:text-red-600" :aria-label="t('posSettings.remove', { name: formatAmount(currency, amount) })" @click="paymentsSection.draft.fastCash[currency].splice(index, 1)">&times;</button>
            </span>
          </div>
          <div class="mt-2 flex max-w-xs gap-2">
            <input
              v-model="newAmount[currency]"
              v-numeric
              type="text"
              inputmode="decimal"
              :placeholder="currency === 'KHR' ? '5000' : '5'"
              :class="ROW_INPUT"
              @keydown.enter.prevent="addAmount(currency)"
            />
            <button type="button" :class="SMALL_BUTTON" @click="addAmount(currency)">{{ t("posSettings.add") }}</button>
          </div>
          <p v-if="amountError[currency]" class="mt-1 text-xs font-medium text-red-700">{{ amountError[currency] }}</p>
        </div>

        <div class="mt-5 flex items-center justify-end gap-2">
          <p v-if="paymentsSection.error" class="mr-auto text-xs font-medium text-red-700">{{ paymentsSection.error }}</p>
          <p v-else-if="paymentsSection.justSaved" class="mr-auto text-xs font-medium text-emerald-700">{{ t("posSettings.saved") }}</p>
          <button v-if="paymentsSection.isDirty" type="button" :class="SMALL_BUTTON" @click="paymentsSection.discard()">{{ t("posSettings.discard") }}</button>
          <button
            type="button"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!paymentsSection.isDirty || paymentsSection.isSaving"
            @click="paymentsSection.save()"
          >
            {{ paymentsSection.isSaving ? t("common.saving") : t("common.save") }}
          </button>
        </div>
      </section>

      <!-- Language -->
      <section v-if="languageSection.draft" class="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 class="font-semibold text-slate-900">{{ t("posSettings.language.heading") }}</h3>
        <p class="text-xs text-slate-500">{{ t("posSettings.language.hint") }}</p>
        <p v-if="isLanguageUnset && store.response?.configured" class="mt-2 text-xs text-amber-800">{{ t("posSettings.language.unset") }}</p>
        <div class="mt-3 flex flex-wrap gap-4" role="radiogroup" :aria-label="t('posSettings.language.heading')">
          <label v-for="language in LANGUAGES" :key="language.value" class="flex items-center gap-2 text-sm text-slate-700">
            <input v-model="languageSection.draft.language" type="radio" class="h-4 w-4" :value="language.value" />
            {{ language.label }}
          </label>
        </div>
        <div class="mt-5 flex items-center justify-end gap-2">
          <p v-if="languageSection.error" class="mr-auto text-xs font-medium text-red-700">{{ languageSection.error }}</p>
          <p v-else-if="languageSection.justSaved" class="mr-auto text-xs font-medium text-emerald-700">{{ t("posSettings.saved") }}</p>
          <button v-if="languageSection.isDirty" type="button" :class="SMALL_BUTTON" @click="languageSection.discard()">{{ t("posSettings.discard") }}</button>
          <button
            type="button"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!languageSection.isDirty || languageSection.isSaving"
            @click="languageSection.save()"
          >
            {{ languageSection.isSaving ? t("common.saving") : t("common.save") }}
          </button>
        </div>
      </section>

      <!-- Menu: unavailable items -->
      <section v-if="menuSection.draft" class="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 class="font-semibold text-slate-900">{{ t("posSettings.menu.heading") }}</h3>
        <p class="text-xs text-slate-500">{{ t("posSettings.menu.hint") }}</p>
        <p v-if="isMenuUnset && store.response?.configured" class="mt-2 text-xs text-amber-800">{{ t("posSettings.menu.unset") }}</p>
        <div class="mt-3 flex flex-wrap gap-4" role="radiogroup" :aria-label="t('posSettings.menu.heading')">
          <label v-for="hide in [false, true]" :key="String(hide)" class="flex items-center gap-2 text-sm text-slate-700">
            <input v-model="menuSection.draft.hideUnavailableItems" type="radio" class="h-4 w-4" :value="hide" />
            {{ hide ? t("posSettings.menu.hide") : t("posSettings.menu.show") }}
          </label>
        </div>
        <div class="mt-5 flex items-center justify-end gap-2">
          <p v-if="menuSection.error" class="mr-auto text-xs font-medium text-red-700">{{ menuSection.error }}</p>
          <p v-else-if="menuSection.justSaved" class="mr-auto text-xs font-medium text-emerald-700">{{ t("posSettings.saved") }}</p>
          <button v-if="menuSection.isDirty" type="button" :class="SMALL_BUTTON" @click="menuSection.discard()">{{ t("posSettings.discard") }}</button>
          <button
            type="button"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!menuSection.isDirty || menuSection.isSaving"
            @click="menuSection.save()"
          >
            {{ menuSection.isSaving ? t("common.saving") : t("common.save") }}
          </button>
        </div>
      </section>

      <!-- KHQR banks -->
      <section class="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 class="font-semibold text-slate-900">{{ t("posSettings.khqr.heading") }}</h3>
        <p class="text-xs text-slate-500">{{ t("posSettings.khqr.hint") }}</p>

        <p v-if="banks.length === 0" class="mt-3 text-sm text-slate-400">{{ t("posSettings.khqr.empty") }}</p>
        <ul v-else class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <li v-for="bank in banks" :key="bank.id" class="rounded-lg border border-slate-200 p-3 text-center">
            <img :src="resolveImageUrl(bank.imageUrl) ?? undefined" :alt="t('posSettings.khqr.qrAlt', { name: bank.name })" class="mx-auto h-28 w-28 object-contain" />
            <p class="mt-2 truncate text-sm font-medium text-slate-800">{{ bank.name }}</p>
            <div class="mt-2 flex justify-center gap-1">
              <template v-if="pendingRemoveId === bank.id">
                <button type="button" class="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100" @click="pendingRemoveId = null">{{ t("common.cancel") }}</button>
                <button type="button" class="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40" :disabled="isSavingBank" @click="removeBank(bank.id)">
                  {{ t("posSettings.khqr.confirmRemove") }}
                </button>
              </template>
              <button v-else type="button" class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" :aria-label="t('posSettings.remove', { name: bank.name })" @click="pendingRemoveId = bank.id">
                <Trash2 class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>

        <div class="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
          <span class="text-sm font-medium text-slate-700">{{ t("posSettings.khqr.addHeading") }}</span>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input v-model="newBankName" maxlength="60" :placeholder="t('posSettings.khqr.namePlaceholder')" :class="INPUT" />
            <input
              :key="fileInputKey"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="text-sm text-slate-600"
              :aria-label="t('posSettings.khqr.image')"
              @change="newBankFile = ($event.target as HTMLInputElement).files?.[0] ?? null"
            />
            <button type="button" :class="SMALL_BUTTON" :disabled="!canAddBank" @click="addBank">
              {{ isSavingBank ? t("common.saving") : t("posSettings.khqr.add") }}
            </button>
          </div>
          <p v-if="banks.length >= KHQR_MAX" class="mt-1 text-xs text-slate-500">{{ t("posSettings.store.full", { count: KHQR_MAX }) }}</p>
          <p v-if="bankError" class="mt-1 text-xs font-medium text-red-700">{{ bankError }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
