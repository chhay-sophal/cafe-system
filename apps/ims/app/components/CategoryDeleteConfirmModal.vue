<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { HttpError } from "~/composables/useApi";
import type { Category } from "~/types/catalog";

const props = defineProps<{
  category: Category | null;
}>();

const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const auth = useAuth();
const store = useCatalogStore();

const isDeleting = ref(false);
const errorMessage = ref<string | null>(null);
const reassignToCategoryId = ref("");
// Only known for certain once the server has rejected a plain delete with a
// product count - computed eagerly too so the picker shows up immediately
// for the common case, without waiting on a round trip.
const productCount = ref(0);

const otherCategories = computed(() => store.categories.filter((c) => c.id !== props.category?.id));
const needsReassignment = computed(() => productCount.value > 0);
const canDelete = computed(() => !isDeleting.value && (!needsReassignment.value || reassignToCategoryId.value !== ""));

watch(open, (isOpen) => {
  if (isOpen && props.category) {
    errorMessage.value = null;
    reassignToCategoryId.value = "";
    productCount.value = store.products.filter((p) => p.categoryId === props.category?.id).length;
  }
});

function close() {
  open.value = false;
}

async function confirmDelete() {
  if (!props.category || !canDelete.value) {
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
    await store.deleteCategory(props.category.id, token, reassignToCategoryId.value || undefined);
    open.value = false;
  } catch (error) {
    // A race (a product got added to this category after the modal opened)
    // surfaces here with a fresh productCount - show the picker instead of
    // leaving the manager at a dead end.
    if (error instanceof HttpError && typeof (error.body as { productCount?: unknown })?.productCount === "number") {
      productCount.value = (error.body as { productCount: number }).productCount;
    }
    errorMessage.value = error instanceof Error ? error.message : t("categories.deleteError");
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div v-if="open && category" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold text-slate-900">{{ $t("categories.deleteHeading") }}</h2>
      <p class="mt-2 text-sm text-slate-600">
        <i18n-t keypath="categories.deleteConfirm" tag="span">
          <template #name><span class="font-semibold">{{ category.name }}</span></template>
        </i18n-t>
      </p>

      <template v-if="needsReassignment">
        <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
          {{ $t("categories.reassignHint", { count: productCount, name: category.name }) }}
        </p>

        <div v-if="otherCategories.length > 0" class="mt-3">
          <label class="block text-sm font-medium text-slate-700">{{ $t("categories.reassignLabel") }}</label>
          <select
            v-model="reassignToCategoryId"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">{{ $t("common.selectEllipsis") }}</option>
            <option v-for="other in otherCategories" :key="other.id" :value="other.id">{{ other.name }}</option>
          </select>
        </div>

        <p v-else class="mt-3 text-sm font-medium text-red-600">{{ $t("categories.reassignNoTarget") }}</p>
      </template>

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
          :disabled="!canDelete"
          class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="confirmDelete"
        >
          {{ isDeleting ? $t("common.deleting") : $t("categories.deleteHeading") }}
        </button>
      </div>
    </div>
  </div>
</template>
