<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Product } from "~/types/catalog";

const emit = defineEmits<{
  create: [];
  edit: [product: Product];
  delete: [product: Product];
  manageCategories: [];
}>();

const auth = useAuth();
const store = useCatalogStore();

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

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatPrice(value: number): string {
  return currencyFormatter.format(value);
}

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
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-slate-700">{{ $t("productTable.heading") }}</h2>
      <div class="flex gap-2">
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
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("productTable.image") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("productTable.item") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("productTable.category") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("productTable.basePrice") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("productTable.available") }}</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="store.products.length === 0">
            <td colspan="6" class="px-4 py-8 text-center text-slate-400">{{ $t("productTable.empty") }}</td>
          </tr>

          <tr v-for="product in store.products" :key="product.id">
            <td class="px-4 py-3">
              <img
                v-if="resolveImageUrl(product.imageUrl) && !failedImageUrls.has(resolveImageUrl(product.imageUrl)!)"
                :src="resolveImageUrl(product.imageUrl)!"
                :alt="product.name"
                class="h-10 w-10 rounded-lg object-cover"
                @error="markImageFailed(resolveImageUrl(product.imageUrl)!)"
              />
              <div
                v-else
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-400"
              >
                {{ product.name.slice(0, 1) }}
              </div>
            </td>
            <td class="px-4 py-3 text-slate-700">{{ product.name }}</td>
            <td class="px-4 py-3 text-slate-700">{{ categoryNameById.get(product.categoryId) ?? $t("common.dash") }}</td>
            <td class="px-4 py-3 text-slate-700">{{ formatPrice(product.basePrice) }}</td>
            <td class="px-4 py-3">
              <button
                type="button"
                role="switch"
                :aria-checked="product.isAvailable"
                :disabled="togglingIds.has(product.id)"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
                :class="product.isAvailable ? 'bg-emerald-500' : 'bg-slate-300'"
                @click="toggleAvailability(product)"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="product.isAvailable ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="emit('edit', product)"
                >
                  {{ $t("common.edit") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  @click="emit('delete', product)"
                >
                  {{ $t("common.delete") }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
