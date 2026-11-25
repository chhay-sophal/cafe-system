<script setup lang="ts">
import { computed, onMounted } from "vue";

const { t } = useI18n();
const store = useReportsStore();
const catalog = useCatalogStore();

// The menu comes from the catalog store - loaded once per session, and kept
// up to date by the Menu page's edits.
onMounted(() => {
  if (!catalog.hasLoadedOnce) {
    catalog.fetchCatalog();
  }
});

interface Group {
  category: string;
  items: Array<{ id: string; name: string; isAvailable: boolean }>;
}

// Menu items with no sales in the period, by category in menu order -
// candidates for promoting or taking off the menu. Unavailable ones are
// marked, since they couldn't sell.
const groups = computed<Group[]>(() => {
  const sold = new Set((store.report?.topProducts ?? []).map((product) => product.productId));
  return catalog.categories
    .map((category) => ({
      category: category.name,
      items: catalog.products
        .filter((product) => product.categoryId === category.id && !sold.has(product.id))
        .map((product) => ({ id: product.id, name: product.name, isAvailable: product.isAvailable }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.items.length > 0);
});

const count = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0));
const isReady = computed(() => catalog.hasLoadedOnce && store.report !== null);
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <h3 class="text-sm font-semibold text-slate-700">
      {{ t("unsoldItems.heading") }}
      <span v-if="isReady" class="font-normal text-slate-400">({{ count }})</span>
    </h3>

    <p v-if="!isReady" class="py-6 text-center text-sm text-slate-400">{{ t("analytics.loadingReport") }}</p>
    <p v-else-if="count === 0" class="py-6 text-center text-sm text-slate-400">{{ t("unsoldItems.none") }}</p>

    <div v-else class="mt-3 max-h-64 space-y-3 overflow-y-auto">
      <div v-for="group in groups" :key="group.category">
        <p class="text-xs font-medium text-slate-500">{{ group.category }}</p>
        <ul class="mt-1 flex flex-wrap gap-1.5">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="rounded-full border px-2.5 py-0.5 text-xs"
            :class="item.isAvailable ? 'border-slate-200 text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-400'"
          >
            {{ item.name }}<span v-if="!item.isAvailable"> · {{ t("unsoldItems.unavailable") }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
