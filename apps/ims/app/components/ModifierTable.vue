<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { ModifierGroup } from "~/types/catalog";

const emit = defineEmits<{
  create: [];
  edit: [group: ModifierGroup];
  delete: [group: ModifierGroup];
}>();

const { t } = useI18n();
const store = useCatalogStore();
const { modifierGroups } = storeToRefs(store);
const { formatMain } = useCurrency();

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, ModifierGroup>();

const columns = columnHelper.columns([
  columnHelper.display({ id: "group", header: () => t("modifierTable.group") }),
  columnHelper.display({ id: "options", header: () => t("modifierTable.options") }),
  columnHelper.display({ id: "products", header: () => t("modifierTable.products") }),
  columnHelper.display({ id: "actions", header: "" }),
]);

const cellClass = {
  group: "px-4 py-3",
  products: "max-w-xs px-4 py-3 text-slate-700",
  actions: "px-4 py-3 text-right",
};

const table = useTable({ features, columns, data: modifierGroups });

onMounted(() => {
  if (!store.hasLoadedOnce) {
    store.fetchCatalog();
  }
});

const productNameById = computed(() => new Map(store.products.map((product) => [product.id, product.name])));

function selectionRule(group: ModifierGroup) {
  const min = group.minSelection ?? 0;
  const max = group.maxSelection ?? 1;
  if (min === max) {
    return t("modifierTable.ruleExactly", { count: max });
  }
  if (min === 0) {
    return t("modifierTable.ruleUpTo", { count: max });
  }
  return t("modifierTable.ruleRange", { min, max });
}

function linkedProductNames(group: ModifierGroup) {
  return group.productIds.map((id) => productNameById.value.get(id)).filter(Boolean).join(", ");
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-700">{{ $t("modifierTable.heading") }}</h2>
      <button
        type="button"
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        @click="emit('create')"
      >
        {{ $t("modifierTable.newButton") }}
      </button>
    </div>

    <p v-if="store.error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ store.error }}</p>

    <p v-else-if="store.isLoading && !store.hasLoadedOnce" class="p-6 text-center text-sm text-slate-500">
      {{ $t("modifierTable.loading") }}
    </p>

    <div v-else class="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
      <DataTable :table="table" :empty-text="$t('modifierTable.empty')" :cell-class="cellClass" :row-class="() => 'align-top'">
        <template #cell-group="{ item }">
          <div class="font-medium text-slate-700">{{ item.name }}</div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              class="rounded-full px-2 py-0.5 font-semibold"
              :class="(item.minSelection ?? 0) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'"
            >
              {{ (item.minSelection ?? 0) > 0 ? $t("modifierTable.required") : $t("modifierTable.optional") }}
            </span>
            <span class="text-slate-500">{{ selectionRule(item) }}</span>
          </div>
        </template>

        <template #cell-options="{ item }">
          <ul class="space-y-0.5">
            <li v-for="option in item.options" :key="option.id">
              {{ option.name }}
              <span v-if="option.priceExtra > 0" class="text-xs text-slate-500">+{{ formatMain(option.priceExtra) }}</span>
            </li>
          </ul>
        </template>

        <template #cell-products="{ item }">
          <span v-if="item.productIds.length === 0" class="text-slate-400">{{ $t("modifierTable.noProducts") }}</span>
          <span v-else>{{ linkedProductNames(item) }}</span>
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
