<script setup lang="ts">
import { ref, watch } from "vue";
import type { InventoryItem } from "~/types/inventory";

const props = defineProps<{
  item: InventoryItem | null;
}>();

const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const auth = useAuth();
const store = useInventoryStore();

const isDeleting = ref(false);
const errorMessage = ref<string | null>(null);

watch(open, (isOpen) => {
  if (isOpen) {
    errorMessage.value = null;
  }
});

function close() {
  open.value = false;
}

async function confirmDelete() {
  if (!props.item || isDeleting.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    errorMessage.value = t("common.sessionExpired");
    return;
  }

  isDeleting.value = true;
  errorMessage.value = null;

  try {
    await store.deleteItem(props.item.id, token);
    open.value = false;
  } catch (error) {
    // A recipe-bound item is rejected by the backend with an explicit
    // message - surface it here rather than closing, so the manager sees
    // exactly why the delete was refused before deciding what to do next.
    errorMessage.value = error instanceof Error ? error.message : t("inventoryItem.deleteError");
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div v-if="open && item" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold text-slate-900">{{ $t("inventoryItem.deleteHeading") }}</h2>
      <p class="mt-2 text-sm text-slate-600">
        <i18n-t keypath="inventoryItem.deleteConfirm" tag="span">
          <template #name><span class="font-semibold">{{ item.name }}</span></template>
        </i18n-t>
      </p>

      <p v-if="errorMessage" class="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
        {{ errorMessage }}
      </p>

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
          :disabled="isDeleting"
          class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="confirmDelete"
        >
          {{ isDeleting ? $t("common.deleting") : $t("common.delete") }}
        </button>
      </div>
    </div>
  </div>
</template>
