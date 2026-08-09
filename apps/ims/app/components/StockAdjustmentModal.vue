<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AdjustmentType, InventoryItem } from "~/types/inventory";

const props = defineProps<{
  item: InventoryItem | null;
}>();

const open = defineModel<boolean>("open", { default: false });

const auth = useAuth();
const store = useInventoryStore();

const ADJUSTMENT_TYPES: Array<{ value: AdjustmentType; label: string }> = [
  { value: "RESTOCK", label: "Restock" },
  { value: "WASTAGE", label: "Wastage" },
  { value: "AUDIT_CORRECTION", label: "Audit Correction" },
];

const type = ref<AdjustmentType>("RESTOCK");
const quantity = ref<number | null>(null);
const notes = ref("");
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

const quantityLabel = computed(() => {
  if (type.value === "RESTOCK") return "Quantity Received";
  if (type.value === "WASTAGE") return "Quantity Wasted";
  return "Adjustment Amount (use - for a reduction)";
});

// Restock/wastage always move stock in one direction; only an audit
// correction can legitimately go either way, so it's the only type where the
// cashier enters the signed value directly.
const resolvedQuantityChanged = computed(() => {
  if (quantity.value === null) {
    return 0;
  }
  if (type.value === "RESTOCK") {
    return Math.abs(quantity.value);
  }
  if (type.value === "WASTAGE") {
    return -Math.abs(quantity.value);
  }
  return quantity.value;
});

const canSubmit = computed(() => quantity.value !== null && quantity.value !== 0 && !isSubmitting.value);

watch(open, (isOpen) => {
  if (isOpen) {
    type.value = "RESTOCK";
    quantity.value = null;
    notes.value = "";
    errorMessage.value = null;
  }
});

function close() {
  open.value = false;
}

async function submit() {
  if (!props.item || !canSubmit.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    errorMessage.value = "Your session has expired. Please sign in again.";
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    await store.adjustStock(
      {
        inventoryItemId: props.item.id,
        quantityChanged: resolvedQuantityChanged.value,
        type: type.value,
        notes: notes.value.trim() || undefined,
      },
      token,
    );
    open.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to submit adjustment.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div v-if="open && item" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg font-bold text-slate-900">Adjust Stock</h2>
          <p class="text-sm text-slate-500">{{ item.name }}</p>
        </div>
        <button type="button" class="text-2xl leading-none text-slate-400 hover:text-slate-600" @click="close">
          &times;
        </button>
      </div>

      <p class="mt-4 text-sm text-slate-600">
        Current stock: <span class="font-semibold text-slate-900">{{ item.stockQuantity }} {{ item.unit }}</span>
      </p>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">Adjustment Type</label>
        <select
          v-model="type"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option v-for="option in ADJUSTMENT_TYPES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">{{ quantityLabel }}</label>
        <input
          v-model.number="quantity"
          type="number"
          step="any"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          :placeholder="`Amount in ${item.unit}`"
        />
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">Notes (optional)</label>
        <textarea
          v-model="notes"
          rows="2"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="e.g. Delivery from supplier, spoilage during prep..."
        />
      </div>

      <p v-if="errorMessage" class="mt-4 text-sm font-medium text-red-600">{{ errorMessage }}</p>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!canSubmit"
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          {{ isSubmitting ? "Saving..." : "Save Adjustment" }}
        </button>
      </div>
    </div>
  </div>
</template>
