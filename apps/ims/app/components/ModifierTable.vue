<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Pencil, Trash2 } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { columnVisibilityFeature, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { ModifierGroup } from "~/types/catalog";
import type { TableFilterDef } from "~/types/table";

const emit = defineEmits<{
  create: [];
  edit: [group: ModifierGroup];
  delete: [group: ModifierGroup];
}>();

const { t } = useI18n();
const store = useCatalogStore();
const { modifierGroups } = storeToRefs(store);
const { formatMain } = useCurrency();

// Defined before the columns: the products column's accessor reads it as
// soon as the table builds its rows.
const productNameById = computed(() => new Map(store.products.map((product) => [product.id, product.name])));

const features = tableFeatures({ ...sortingFeatures, ...filteringFeatures, columnVisibilityFeature });
const columnHelper = createColumnHelper<typeof features, ModifierGroup>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", { id: "group", header: () => t("modifierTable.group") }),
  // Rendered via slots; the accessors give search the option and menu item
  // names. Sorting a comma-joined list means nothing, so it's off.
  columnHelper.accessor((group) => group.options.map((option) => option.name).join(", "), {
    id: "options",
    header: () => t("modifierTable.options"),
    enableSorting: false,
  }),
  columnHelper.accessor((group) => linkedProductNames(group), {
    id: "products",
    header: () => t("modifierTable.products"),
    enableSorting: false,
  }),
  columnHelper.display({ id: "actions", header: "" }),
  // Hidden, filter-only columns: the group cell's badge and the products
  // cell already show this information.
  columnHelper.accessor((group) => (group.minSelection ?? 0) > 0, {
    id: "required",
    filterFn: "equals",
    enableGlobalFilter: false,
    enableSorting: false,
  }),
  columnHelper.accessor("productIds", {
    id: "menuItem",
    filterFn: "contains",
    enableGlobalFilter: false,
    enableSorting: false,
  }),
  columnHelper.accessor((group) => group.productIds.length > 0, {
    id: "linked",
    filterFn: "equals",
    enableGlobalFilter: false,
    enableSorting: false,
  }),
]);

const cellClass = {
  group: "px-4 py-3",
  products: "max-w-xs px-4 py-3 text-slate-700",
  actions: "px-4 py-3 text-right",
};

const table = useTable({
  features,
  columns,
  data: modifierGroups,
  globalFilterFn: "includesDisplayText",
  initialState: { columnVisibility: { required: false, menuItem: false, linked: false } },
});

const filters = computed<TableFilterDef[]>(() => [
  {
    type: "select",
    columnId: "required",
    label: t("modifierTable.requirement"),
    options: [
      { value: true, label: t("modifierTable.required") },
      { value: false, label: t("modifierTable.optional") },
    ],
  },
  {
    type: "select",
    columnId: "menuItem",
    label: t("modifierTable.menuItem"),
    options: store.products.map((product) => ({ value: product.id, label: product.name })),
  },
  {
    type: "select",
    columnId: "linked",
    label: t("modifierTable.linkedFilter"),
    options: [
      { value: true, label: t("modifierTable.linkedYes") },
      { value: false, label: t("modifierTable.linkedNo") },
    ],
  },
]);

// "No modifier groups yet" would be wrong when groups exist but the search
// or filters hide them all.
const emptyText = computed(() =>
  modifierGroups.value.length > 0 ? t("modifierTable.noMatches") : t("modifierTable.empty"),
);

onMounted(() => {
  if (!store.hasLoadedOnce) {
    store.fetchCatalog();
  }
});

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
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <TableFilters :table="table" :search-placeholder="$t('modifierTable.searchPlaceholder')" :filters="filters" />
      <button
        type="button"
        class="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
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
      <DataTable :table="table" :empty-text="emptyText" :cell-class="cellClass" :row-class="() => 'align-top'">
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
            <IconButton :icon="Pencil" :label="$t('common.edit')" @click="emit('edit', item)" />
            <IconButton :icon="Trash2" :label="$t('common.delete')" variant="danger" @click="emit('delete', item)" />
          </div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
