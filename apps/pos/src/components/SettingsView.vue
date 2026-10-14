<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { setLocale } from "../i18n";
import { useKhqrBanks } from "../composables/useKhqrBanks";
import { useReceiptPrinter } from "../composables/useReceiptPrinter";
import { useTheme, type ThemePreference } from "../composables/useTheme";
import type { PaperSize } from "../lib/receipt";

type SectionId = "general" | "printer" | "khqr";
type Locale = "en-US" | "km-KH";

const { t, locale } = useI18n({ useScope: "global" });

// New sections are added here and get a matching panel in the template.
const sections = computed<Array<{ id: SectionId; label: string }>>(() => [
  { id: "general", label: t("settings.sections.general") },
  { id: "printer", label: t("settings.sections.printer") },
  { id: "khqr", label: t("settings.sections.khqr") },
]);

// Language names are shown in their own script, not translated, so a
// cashier can always find their language whatever the current one is.
const LANGUAGES: Array<{ value: Locale; label: string }> = [
  { value: "en-US", label: "English" },
  { value: "km-KH", label: "ខ្មែរ" },
];

// Roll widths are written the same in every language, so not translated.
const PAPER_SIZES: Array<{ value: PaperSize; label: string }> = [
  { value: "58mm", label: "58 mm" },
  { value: "64mm", label: "64 mm" },
  { value: "80mm", label: "80 mm" },
];

const theme = useTheme();
const THEMES = computed<Array<{ value: ThemePreference; label: string }>>(() => [
  { value: "system", label: t("settings.general.themeSystem") },
  { value: "light", label: t("settings.general.themeLight") },
  { value: "dark", label: t("settings.general.themeDark") },
]);

const activeSection = ref<SectionId>("general");

const receiptPrinter = useReceiptPrinter();

// Keep a saved printer selectable even while Windows doesn't list it (e.g.
// unplugged), instead of the dropdown silently showing "No printer".
const printerOptions = computed(() => {
  const saved = receiptPrinter.printerName.value;
  const listed = receiptPrinter.availablePrinters.value;
  return saved && !listed.includes(saved) ? [saved, ...listed] : listed;
});

onMounted(receiptPrinter.refreshPrinters);

const khqrBanks = useKhqrBanks();
const newBankName = ref("");
const newBankQrFile = ref<File | null>(null);
// Bumped after each add to remount (and so clear) the file input, which
// can't be reset through v-model.
const qrInputKey = ref(0);
const isAddingBank = ref(false);
const bankError = ref<string | null>(null);
const pendingRemoveBankId = ref<string | null>(null);

const canAddBank = computed(() => newBankName.value.trim() !== "" && newBankQrFile.value !== null && !isAddingBank.value);

function handleQrFileChange(event: Event) {
  newBankQrFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function handleAddBank() {
  if (!canAddBank.value || !newBankQrFile.value) {
    return;
  }

  isAddingBank.value = true;
  bankError.value = null;
  try {
    await khqrBanks.addBank(newBankName.value, newBankQrFile.value);
    newBankName.value = "";
    newBankQrFile.value = null;
    qrInputKey.value += 1;
  } catch (error) {
    // Unreadable file, or localStorage full.
    console.error("Failed to add bank:", error);
    bankError.value = t("settings.khqr.addError");
  } finally {
    isAddingBank.value = false;
  }
}

function handleRemoveBank(id: string) {
  khqrBanks.removeBank(id);
  pendingRemoveBankId.value = null;
}
</script>

<template>
  <section class="settings">
    <nav class="settings__nav" :aria-label="t('settings.heading')">
      <h2 class="settings__heading">{{ t("settings.heading") }}</h2>
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="settings__nav-item"
        :class="{ 'settings__nav-item--active': activeSection === section.id }"
        @click="activeSection = section.id"
      >
        {{ section.label }}
      </button>
    </nav>

    <div class="settings__panel">
      <template v-if="activeSection === 'general'">
        <h3 class="settings__panel-heading">{{ t("settings.sections.general") }}</h3>

        <div class="settings-field">
          <div class="settings-field__text">
            <span class="settings-field__label">{{ t("settings.general.language") }}</span>
            <span class="settings-field__hint">{{ t("settings.general.languageHint") }}</span>
          </div>
          <div class="settings-choice" role="radiogroup" :aria-label="t('settings.general.language')">
            <button
              v-for="language in LANGUAGES"
              :key="language.value"
              type="button"
              role="radio"
              :aria-checked="locale === language.value"
              class="settings-choice__option"
              :class="{ 'settings-choice__option--active': locale === language.value }"
              @click="setLocale(language.value)"
            >
              {{ language.label }}
            </button>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field__text">
            <span class="settings-field__label">{{ t("settings.general.appearance") }}</span>
            <span class="settings-field__hint">{{ t("settings.general.appearanceHint") }}</span>
          </div>
          <div class="settings-choice" role="radiogroup" :aria-label="t('settings.general.appearance')">
            <button
              v-for="option in THEMES"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="theme.preference.value === option.value"
              class="settings-choice__option"
              :class="{ 'settings-choice__option--active': theme.preference.value === option.value }"
              @click="theme.setPreference(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="activeSection === 'printer'">
        <h3 class="settings__panel-heading">{{ t("settings.sections.printer") }}</h3>

        <div class="settings-field">
          <div class="settings-field__text">
            <label class="settings-field__label" for="receipt-printer">{{ t("receipt.printerAria") }}</label>
            <span class="settings-field__hint">{{ t("settings.printer.hint") }}</span>
          </div>
          <div class="settings-field__control">
            <select
              id="receipt-printer"
              class="settings-select"
              :value="receiptPrinter.printerName.value ?? ''"
              @change="receiptPrinter.setPrinter(($event.target as HTMLSelectElement).value || null)"
            >
              <option value="">{{ t("receipt.noPrinterOption") }}</option>
              <option v-for="name in printerOptions" :key="name" :value="name">{{ name }}</option>
            </select>
            <button type="button" class="settings-choice__option" @click="receiptPrinter.refreshPrinters()">
              {{ t("salesHistory.refresh") }}
            </button>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field__text">
            <span class="settings-field__label">{{ t("settings.printer.paperSize") }}</span>
            <span class="settings-field__hint">{{ t("settings.printer.paperSizeHint") }}</span>
          </div>
          <div class="settings-choice" role="radiogroup" :aria-label="t('settings.printer.paperSize')">
            <button
              v-for="size in PAPER_SIZES"
              :key="size.value"
              type="button"
              role="radio"
              :aria-checked="receiptPrinter.paperSize.value === size.value"
              class="settings-choice__option"
              :class="{ 'settings-choice__option--active': receiptPrinter.paperSize.value === size.value }"
              @click="receiptPrinter.setPaperSize(size.value)"
            >
              {{ size.label }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="activeSection === 'khqr'">
        <h3 class="settings__panel-heading">{{ t("settings.sections.khqr") }}</h3>
        <p class="settings__intro">{{ t("settings.khqr.intro") }}</p>

        <p v-if="khqrBanks.banks.value.length === 0" class="settings__empty">{{ t("settings.khqr.empty") }}</p>
        <ul v-else class="bank-list">
          <li v-for="bank in khqrBanks.banks.value" :key="bank.id" class="bank-list__item">
            <img :src="bank.qrImage" :alt="t('settings.khqr.qrAlt', { name: bank.name })" class="bank-list__qr" />
            <span class="bank-list__name">{{ bank.name }}</span>
            <div class="settings-field__control">
              <template v-if="pendingRemoveBankId === bank.id">
                <button type="button" class="settings-choice__option" @click="pendingRemoveBankId = null">
                  {{ t("common.cancel") }}
                </button>
                <button type="button" class="settings-danger" @click="handleRemoveBank(bank.id)">
                  {{ t("settings.khqr.confirmRemove") }}
                </button>
              </template>
              <button v-else type="button" class="settings-choice__option" @click="pendingRemoveBankId = bank.id">
                {{ t("settings.khqr.remove") }}
              </button>
            </div>
          </li>
        </ul>

        <form class="bank-form" @submit.prevent="handleAddBank">
          <span class="settings-field__label">{{ t("settings.khqr.addHeading") }}</span>
          <label class="bank-form__field">
            <span class="settings-field__hint">{{ t("settings.khqr.bankName") }}</span>
            <input
              v-model="newBankName"
              type="text"
              maxlength="40"
              class="settings-input"
              :placeholder="t('settings.khqr.bankNamePlaceholder')"
            />
          </label>
          <label class="bank-form__field">
            <span class="settings-field__hint">{{ t("settings.khqr.qrImage") }}</span>
            <input :key="qrInputKey" type="file" accept="image/*" class="bank-form__file" @change="handleQrFileChange" />
          </label>
          <p v-if="bankError" class="settings__error">{{ bankError }}</p>
          <button type="submit" class="settings-primary" :disabled="!canAddBank">
            {{ isAddingBank ? t("settings.khqr.adding") : t("settings.khqr.add") }}
          </button>
        </form>
      </template>
    </div>
  </section>
</template>

<style scoped>
.settings {
  flex: 1;
  min-height: 0;
  display: flex;
}

.settings__nav {
  flex-shrink: 0;
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1.25rem 0.75rem;
  background: #ffffff;
  border-right: 2px solid #e2e2e2;
  overflow-y: auto;
}

.settings__heading {
  margin: 0 0 0.75rem;
  padding: 0 0.5rem;
  font-size: 1.25rem;
}

.settings__nav-item {
  min-height: 48px;
  padding: 0 1rem;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #444444;
  font-size: 1rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.settings__nav-item--active {
  background: #111111;
  color: #ffffff;
}

.settings__panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.settings__panel-heading {
  margin: 0;
  font-size: 1.15rem;
}

.settings-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
}

.settings-field__text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.settings-field__label {
  font-weight: 700;
}

.settings-field__hint {
  font-size: 0.85rem;
  color: #777777;
}

.settings-choice,
.settings-field__control {
  display: flex;
  gap: 0.5rem;
}

.settings__intro,
.settings__empty {
  margin: 0;
  color: #777777;
  font-size: 0.9rem;
}

.settings__error {
  margin: 0;
  color: #c0392b;
  font-weight: 600;
  font-size: 0.9rem;
}

.bank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bank-list__item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.25rem 0.75rem 0.75rem;
  border-radius: 14px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
}

.bank-list__qr {
  width: 72px;
  height: 72px;
  object-fit: contain;
  border-radius: 8px;
  background: #ffffff;
}

.bank-list__name {
  flex: 1;
  font-weight: 700;
}

.bank-form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: #ffffff;
  border: 2px dashed #dcdcdc;
}

.bank-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.bank-form__file {
  font-size: 0.95rem;
}

.settings-input {
  min-height: 44px;
  min-width: 280px;
  padding: 0 0.75rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
}

.settings-primary,
.settings-danger {
  min-height: 44px;
  padding: 0 1.25rem;
  border-radius: 10px;
  border: none;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.settings-primary {
  background: #111111;
  color: #ffffff;
}

.settings-primary:disabled {
  opacity: 0.4;
  cursor: default;
}

.settings-danger {
  background: #c0392b;
  color: #ffffff;
}

.settings-select {
  min-height: 44px;
  min-width: 220px;
  max-width: 320px;
  padding: 0 0.75rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
}

.settings-choice__option {
  min-height: 44px;
  min-width: 96px;
  padding: 0 1rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.settings-choice__option--active {
  border-color: #111111;
  background: #111111;
  color: #ffffff;
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity, so they override light styles
   exactly as the prefers-color-scheme media query used to. */
:where(:root[data-theme="dark"]) .settings__nav {
  background: #1c1c1c;
  border-right-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .settings__nav-item {
  color: #cccccc;
}

:where(:root[data-theme="dark"]) .settings__nav-item--active {
  background: #f6f6f6;
  color: #111111;
}

:where(:root[data-theme="dark"]) .settings-field,
:where(:root[data-theme="dark"]) .bank-list__item,
:where(:root[data-theme="dark"]) .bank-form {
  background: #242424;
  border-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .settings-input {
  background: #2e2e2e;
  border-color: #3a3a3a;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .settings-primary {
  background: #f6f6f6;
  color: #111111;
}

:where(:root[data-theme="dark"]) .settings-choice__option,
:where(:root[data-theme="dark"]) .settings-select {
  background: #2e2e2e;
  border-color: #3a3a3a;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .settings-choice__option--active {
  background: #f6f6f6;
  border-color: #f6f6f6;
  color: #111111;
}
</style>
