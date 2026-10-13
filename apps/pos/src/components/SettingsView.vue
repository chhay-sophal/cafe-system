<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { setLocale } from "../i18n";
import { useReceiptPrinter } from "../composables/useReceiptPrinter";

type SectionId = "general" | "printer";
type Locale = "en-US" | "km-KH";

const { t, locale } = useI18n({ useScope: "global" });

// New sections are added here and get a matching panel in the template.
const sections = computed<Array<{ id: SectionId; label: string }>>(() => [
  { id: "general", label: t("settings.sections.general") },
  { id: "printer", label: t("settings.sections.printer") },
]);

// Language names are shown in their own script, not translated, so a
// cashier can always find their language whatever the current one is.
const LANGUAGES: Array<{ value: Locale; label: string }> = [
  { value: "en-US", label: "English" },
  { value: "km-KH", label: "ខ្មែរ" },
];

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

@media (prefers-color-scheme: dark) {
  .settings__nav {
    background: #1c1c1c;
    border-right-color: #3a3a3a;
  }

  .settings__nav-item {
    color: #cccccc;
  }

  .settings__nav-item--active {
    background: #f6f6f6;
    color: #111111;
  }

  .settings-field {
    background: #242424;
    border-color: #3a3a3a;
  }

  .settings-choice__option,
  .settings-select {
    background: #2e2e2e;
    border-color: #3a3a3a;
    color: #f6f6f6;
  }

  .settings-choice__option--active {
    background: #f6f6f6;
    border-color: #f6f6f6;
    color: #111111;
  }
}
</style>
