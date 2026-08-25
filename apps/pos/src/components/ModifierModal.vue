<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from "vue";
import { useI18n } from "vue-i18n";
import type { CartModifier, ModifierGroup, ModifierOption } from "../types/cart";
import type { Product } from "../types/catalog";

const props = defineProps<{
  product: Product;
  groups: ModifierGroup[];
}>();

const emit = defineEmits<{
  confirm: [modifiers: CartModifier[]];
  cancel: [];
}>();

const { t } = useI18n({ useScope: "global" });

const selections = reactive<Record<string, string[]>>(
  Object.fromEntries(props.groups.map((group) => [group.id, []])),
);

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const selectedModifiers = computed<CartModifier[]>(() => {
  const flat: CartModifier[] = [];
  for (const group of props.groups) {
    const chosenIds = selections[group.id] ?? [];
    for (const option of group.options) {
      if (chosenIds.includes(option.id)) {
        flat.push({ id: option.id, name: option.name, priceExtra: option.priceExtra });
      }
    }
  }
  return flat;
});

const runningUnitPrice = computed(
  () => props.product.basePrice + selectedModifiers.value.reduce((sum, m) => sum + m.priceExtra, 0),
);

function isGroupSatisfied(group: ModifierGroup): boolean {
  const required = group.minSelection ?? 0;
  return (selections[group.id]?.length ?? 0) >= required;
}

const unsatisfiedGroups = computed(() => props.groups.filter((group) => !isGroupSatisfied(group)));
const canConfirm = computed(() => unsatisfiedGroups.value.length === 0);

function isOptionSelected(group: ModifierGroup, option: ModifierOption): boolean {
  return (selections[group.id] ?? []).includes(option.id);
}

function isOptionDisabled(group: ModifierGroup): boolean {
  const max = group.maxSelection ?? 1;
  return (selections[group.id]?.length ?? 0) >= max;
}

function toggleOption(group: ModifierGroup, option: ModifierOption) {
  const max = group.maxSelection ?? 1;
  const current = selections[group.id] ?? [];
  const alreadySelected = current.includes(option.id);

  if (max === 1) {
    const required = group.minSelection ?? 0;
    if (alreadySelected) {
      selections[group.id] = required > 0 ? current : [];
    } else {
      selections[group.id] = [option.id];
    }
    return;
  }

  if (alreadySelected) {
    selections[group.id] = current.filter((id) => id !== option.id);
  } else if (current.length < max) {
    selections[group.id] = [...current, option.id];
  }
}

function handleConfirm() {
  if (!canConfirm.value) {
    return;
  }
  emit("confirm", selectedModifiers.value);
}

function handleCancel() {
  emit("cancel");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    handleCancel();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="modifier-modal-backdrop" @click.self="handleCancel">
    <div class="modifier-modal" role="dialog" aria-modal="true" :aria-label="t('modifier.customizeAria', { name: product.name })">
      <header class="modifier-modal__header">
        <h2 class="modifier-modal__title">{{ product.name }}</h2>
        <button type="button" class="modifier-modal__close" :aria-label="t('common.close')" @click="handleCancel">
          &times;
        </button>
      </header>

      <div class="modifier-modal__body">
        <section v-for="group in groups" :key="group.id" class="modifier-group">
          <div class="modifier-group__header">
            <span class="modifier-group__name">{{ group.name }}</span>
            <span v-if="(group.minSelection ?? 0) > 0" class="modifier-group__required">
              {{ t("modifier.requiredChoose", { count: group.minSelection }) }}
            </span>
            <span v-else class="modifier-group__optional">{{ t("modifier.optional") }}</span>
          </div>

          <div class="modifier-group__options">
            <button
              v-for="option in group.options"
              :key="option.id"
              type="button"
              class="modifier-option"
              :class="{ 'modifier-option--selected': isOptionSelected(group, option) }"
              :disabled="!isOptionSelected(group, option) && isOptionDisabled(group)"
              @click="toggleOption(group, option)"
            >
              <span class="modifier-option__name">{{ option.name }}</span>
              <span v-if="option.priceExtra" class="modifier-option__price">
                +{{ currencyFormatter.format(option.priceExtra) }}
              </span>
            </button>
          </div>
        </section>
      </div>

      <footer class="modifier-modal__footer">
        <p v-if="unsatisfiedGroups.length > 0" class="modifier-modal__hint">
          {{ t("modifier.selectPrompt", { list: unsatisfiedGroups.map((g) => g.name).join(", ") }) }}
        </p>
        <div class="modifier-modal__actions">
          <span class="modifier-modal__running-price">{{ currencyFormatter.format(runningUnitPrice) }}</span>
          <button type="button" class="modifier-modal__cancel" @click="handleCancel">{{ t("common.cancel") }}</button>
          <button type="button" class="modifier-modal__confirm" :disabled="!canConfirm" @click="handleConfirm">
            {{ t("modifier.addToOrder") }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modifier-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modifier-modal {
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.modifier-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #111111;
  color: #ffffff;
}

.modifier-modal__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.modifier-modal__close {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.modifier-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.modifier-group__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.modifier-group__name {
  font-weight: 700;
  font-size: 1rem;
  color: #1a1a1a;
}

.modifier-group__required {
  font-size: 0.8rem;
  font-weight: 600;
  color: #c0392b;
}

.modifier-group__optional {
  font-size: 0.8rem;
  color: #888888;
}

.modifier-group__options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.modifier-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 0.75rem 1rem;
  border: 2px solid #dcdcdc;
  border-radius: 12px;
  background: #ffffff;
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a1a;
  cursor: pointer;
  transition: transform 0.1s ease, border-color 0.15s ease, background-color 0.15s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.modifier-option:active:not(:disabled) {
  transform: scale(0.97);
}

.modifier-option--selected {
  border-color: #111111;
  background: #111111;
  color: #ffffff;
}

.modifier-option:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modifier-option__price {
  font-weight: 700;
}

.modifier-modal__footer {
  padding: 1rem 1.25rem 1.25rem;
  border-top: 2px solid #eeeeee;
}

.modifier-modal__hint {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  color: #c0392b;
  text-align: center;
}

.modifier-modal__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modifier-modal__running-price {
  font-weight: 700;
  font-size: 1.1rem;
  color: #2a7a4f;
  margin-right: auto;
}

.modifier-modal__cancel,
.modifier-modal__confirm {
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

.modifier-modal__cancel {
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
}

.modifier-modal__confirm {
  border: 2px solid #111111;
  background: #111111;
  color: #ffffff;
  flex: 1;
}

.modifier-modal__confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .modifier-modal {
    background: #242424;
  }

  .modifier-group__name {
    color: #f2f2f2;
  }

  .modifier-modal__footer {
    border-top-color: #3a3a3a;
  }

  .modifier-option {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .modifier-option--selected {
    border-color: #ffffff;
    background: #ffffff;
    color: #111111;
  }

  .modifier-modal__cancel {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .modifier-modal__confirm {
    background: #ffffff;
    border-color: #ffffff;
    color: #111111;
  }
}
</style>
