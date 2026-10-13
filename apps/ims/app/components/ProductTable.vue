<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Product } from "~/types/catalog";

const emit = defineEmits<{
  create: [];
  edit: [product: Product];
  delete: [product: Product];
  manageCategories: [];
}>();

const { t } = useI18n();
const auth = useAuth();
const store = useCatalogStore();
const { products } = storeToRefs(store);

const togglingIds = ref<Set<string>>(new Set());
const failedImageUrls = ref<Set<string>>(new Set());

function markImageFailed(url: string) {
  failedImageUrls.value = new Set(failedImageUrls.value).add(url);
}

onMounted(() => {
  if (!store.hasLoadedOnce) {
    store.fetchCatalog();
  }
});

const categoryNameById = computed(() => {
  const map = new Map<string, string>();
  for (const category of store.categories) {
    map.set(category.id, category.name);
  }
  return map;
});

const { formatMain, formatSecondary } = useCurrency();

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Product>();

const columns = columnHelper.columns([
  columnHelper.display({ id: "image", header: () => t("productTable.image") }),
  columnHelper.accessor("name", { header: () => t("productTable.item") }),
  // Rendered via slots: the category name and price display depend on other
  // store state (categories, currency settings), not just the row itself.
  columnHelper.display({ id: "category", header: () => t("productTable.category") }),
  columnHelper.display({ id: "basePrice", header: () => t("productTable.basePrice") }),
  columnHelper.display({ id: "available", header: () => t("productTable.available") }),
  columnHelper.display({ id: "actions", header: "" }),
]);

const cellClass = {
  image: "px-4 py-3",
  available: "px-4 py-3",
  actions: "px-4 py-3 text-right",
};

const table = useTable({ features, columns, data: products });

async function toggleAvailability(product: Product) {
  const token = auth.session.value?.token;
  if (!token || togglingIds.value.has(product.id)) {
    return;
  }

  togglingIds.value.add(product.id);
  try {
    await store.updateProduct(
      product.id,
      {
        categoryId: product.categoryId,
        name: product.name,
        basePrice: product.basePrice,
        sku: product.sku ?? undefined,
        imageUrl: product.imageUrl ?? undefined,
        isAvailable: !product.isAvailable,
      },
      token,
    );
  } catch {
    // The table already reflects the last-known server state; a failed
    // toggle just leaves it unchanged, no separate error UI needed here.
  } finally {
    togglingIds.value.delete(product.id);
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-700">{{ $t("productTable.heading") }}</h2>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          @click="emit('manageCategories')"
        >
          {{ $t("categories.manage") }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          @click="emit('create')"
        >
          {{ $t("productTable.newButton") }}
        </button>
      </div>
    </div>

    <p v-if="store.error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ store.error }}</p>

    <p v-else-if="store.isLoading && !store.hasLoadedOnce" class="p-6 text-center text-sm text-slate-500">
      {{ $t("productTable.loading") }}
    </p>

    <div v-else class="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
      <DataTable :table="table" :empty-text="$t('productTable.empty')" :cell-class="cellClass">
        <template #cell-image="{ item }">
          <img
            v-if="resolveImageUrl(item.imageUrl) && !failedImageUrls.has(resolveImageUrl(item.imageUrl)!)"
            :src="resolveImageUrl(item.imageUrl)!"
            :alt="item.name"
            class="h-10 w-10 rounded-lg object-cover"
            @error="markImageFailed(resolveImageUrl(item.imageUrl)!)"
          />
          <div
            v-else
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-400"
          >
            {{ item.name.slice(0, 1) }}
          </div>
        </template>

        <template #cell-category="{ item }">
          {{ categoryNameById.get(item.categoryId) ?? $t("common.dash") }}
        </template>

        <template #cell-basePrice="{ item }">
          {{ formatMain(item.basePrice) }}
          <span class="ml-1 text-xs text-slate-400">({{ formatSecondary(item.basePrice) }})</span>
        </template>

        <template #cell-available="{ item }">
          <button
            type="button"
            role="switch"
            :aria-checked="item.isAvailable"
            :disabled="togglingIds.has(item.id)"
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
            :class="item.isAvailable ? 'bg-emerald-500' : 'bg-slate-300'"
            @click="toggleAvailability(item)"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="item.isAvailable ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </template>

        <template #cell-actions="{ item }">
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              @click="emit('edit', item)"
            >
              {{ $t("common.edit") }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              @click="emit('delete', item)"
            >
              {{ $t("common.delete") }}
            </button>
          </div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
