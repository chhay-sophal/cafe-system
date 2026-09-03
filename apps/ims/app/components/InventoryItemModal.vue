<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { InventoryItem } from "~/types/inventory";

const props = defineProps<{
  item: InventoryItem | null;
}>();

const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const auth = useAuth();
const store = useInventoryStore();
const { formatRielEquivalent } = useCurrency();

const UNITS = ["grams", "ml", "pieces"];

const name = ref("");
const unit = ref("grams");
const reorderThreshold = ref<number | null>(null);
const costPerUnit = ref<number | null>(null);
const isActive = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

const isEditMode = computed(() => props.item !== null);

const nameError = computed(() => (name.value.trim().length === 0 ? t("common.nameRequired") : null));
const reorderError = computed(() =>
  reorderThreshold.value === null || reorderThreshold.value < 0 ? t("inventoryItem.reorderError") : null,
);
const costError = computed(() =>
  costPerUnit.value === null || costPerUnit.value < 0 ? t("inventoryItem.costError") : null,
);

const canSubmit = computed(() => !nameError.value && !reorderError.value && !costError.value && !isSubmitting.value);

const costRielPreview = computed(() =>
  costPerUnit.value !== null && !Number.isNaN(costPerUnit.value) && costPerUnit.value >= 0
    ? formatRielEquivalent(costPerUnit.value)
    : null,
);

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }

  errorMessage.value = null;

  if (props.item) {
    name.value = props.item.name;
    unit.value = props.item.unit;
    reorderThreshold.value = props.item.reorderThreshold;
    costPerUnit.value = props.item.costPerUnit;
    isActive.value = props.item.isActive;
  } else {
    name.value = "";
    unit.value = "grams";
    reorderThreshold.value = null;
    costPerUnit.value = null;
    isActive.value = true;
  }
});

function close() {
  open.value = false;
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

  const payload = {
    name: name.value.trim(),
    unit: unit.value,
    reorderThreshold: reorderThreshold.value as number,
    costPerUnit: costPerUnit.value as number,
    isActive: isActive.value,
  };

  try {
    if (props.item) {
      await store.updateItem(props.item.id, payload, token);
    } else {
      await store.createItem(payload, token);
    }
    open.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("inventoryItem.saveError");
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h2 class="text-lg font-bold text-slate-900">{{ isEditMode ? $t("inventoryItem.editHeading") : $t("inventoryItem.newHeading") }}</h2>
        <button type="button" class="text-2xl leading-none text-slate-400 hover:text-slate-600" @click="close">
          &times;
        </button>
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">{{ $t("common.name") }}</label>
        <input
          v-model="name"
          type="text"
          :placeholder="$t('inventoryItem.namePlaceholder')"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">{{ $t("inventoryItem.unit") }}</label>
        <select
          v-model="unit"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option v-for="option in UNITS" :key="option" :value="option">{{ option }}</option>
        </select>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-slate-700">{{ $t("inventoryItem.reorderThreshold") }}</label>
          <input
            v-model.number="reorderThreshold"
            type="number"
            step="any"
            min="0"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">{{ $t("inventoryItem.costPerUnit") }}</label>
          <input
            v-model.number="costPerUnit"
            type="number"
            step="any"
            min="0"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <p v-if="costRielPreview" class="mt-1 text-xs text-slate-400">≈ {{ costRielPreview }}</p>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
        <span class="text-sm font-medium text-slate-700">{{ $t("inventoryItem.activeItem") }}</span>
        <button
          type="button"
          role="switch"
          :aria-checked="isActive"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          :class="isActive ? 'bg-emerald-500' : 'bg-slate-300'"
          @click="isActive = !isActive"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="isActive ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <p v-if="errorMessage" class="mt-4 text-sm font-medium text-red-600">{{ errorMessage }}</p>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="close"
        >
          {{ $t("common.cancel") }}
        </button>
        <button
          type="button"
          :disabled="!canSubmit"
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          {{ isSubmitting ? $t("common.saving") : isEditMode ? $t("common.saveChanges") : $t("inventoryItem.createButton") }}
        </button>
      </div>
    </div>
  </div>
</template>
