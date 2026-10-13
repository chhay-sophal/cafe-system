<script setup lang="ts">
import { computed, ref } from "vue";
import { Pencil, Trash2, Warehouse } from "@lucide/vue";
import { storeToRefs } from "pinia";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  tableFeatures,
  useTable,
} from "@tanstack/vue-table";
import type { InventoryItem } from "~/types/inventory";

const emit = defineEmits<{
  adjust: [item: InventoryItem];
  create: [];
  edit: [item: InventoryItem];
  delete: [item: InventoryItem];
}>();

const { t } = useI18n();
const auth = useAuth();
const store = useInventoryStore();
const { items, isLoading, error } = storeToRefs(store);

const search = ref("");
const unitFilter = ref("");
const togglingIds = ref<Set<string>>(new Set());

const features = tableFeatures({
  ...sortingFeatures,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString },
});

const columnHelper = createColumnHelper<typeof features, InventoryItem>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", { header: () => t("stockTable.columns.item") }),
  columnHelper.accessor("stockQuantity", { header: () => t("stockTable.columns.stock") }),
  columnHelper.accessor("unit", { header: () => t("stockTable.columns.unit"), filterFn: "equalsString" }),
  columnHelper.accessor("reorderThreshold", { header: () => t("stockTable.columns.reorderAt") }),
  // Accessors (for sorting) but rendered via slots and kept out of the
  // search box - matching "true" or a timestamp would just be noise.
  columnHelper.accessor("isLowStock", { id: "status", header: () => t("stockTable.columns.status"), enableGlobalFilter: false }),
  columnHelper.accessor("isActive", { id: "active", header: () => t("stockTable.columns.active"), enableGlobalFilter: false }),
  columnHelper.accessor("updatedAt", { id: "updated", header: () => t("stockTable.columns.updated"), enableGlobalFilter: false }),
  columnHelper.display({ id: "actions", header: "" }),
]);

const cellClass = {
  status: "px-4 py-3",
  active: "px-4 py-3",
  updated: "px-4 py-3 text-xs text-slate-400",
  actions: "px-4 py-3 text-right",
};

const table = useTable({ features, columns, data: items });

function handleSearchInput() {
  table.setGlobalFilter(search.value);
}

function handleUnitFilterChange() {
  table.getColumn("unit")?.setFilterValue(unitFilter.value || undefined);
}

const units = computed(() => store.units);

async function toggleActive(item: InventoryItem) {
  const token = auth.session.value?.token;
  if (!token || togglingIds.value.has(item.id)) {
    return;
  }

  togglingIds.value.add(item.id);
  try {
    await store.updateItem(
      item.id,
      {
        name: item.name,
        unit: item.unit,
        reorderThreshold: item.reorderThreshold,
        costPerUnit: item.costPerUnit,
        isActive: !item.isActive,
      },
      token,
    );
  } catch {
    // The table already reflects the last-known server state; a failed
    // toggle just leaves it unchanged, no separate error UI needed here.
  } finally {
    togglingIds.value.delete(item.id);
  }
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value.replace(" ", "T")).toLocaleString();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <input
        v-model="search"
        type="search"
        :placeholder="$t('stockTable.searchPlaceholder')"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:w-64"
        @input="handleSearchInput"
      />

      <select
        v-model="unitFilter"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        @change="handleUnitFilterChange"
      >
        <option value="">{{ $t("stockTable.allUnits") }}</option>
        <option v-for="unit in units" :key="unit" :value="unit">{{ unit }}</option>
      </select>

      <span v-if="store.lowStockCount > 0" class="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
        {{ $t("stockTable.lowStockBadge", { count: store.lowStockCount }) }}
      </span>

      <button
        type="button"
        class="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        @click="emit('create')"
      >
        {{ $t("stockTable.newButton") }}
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ error }}</p>

    <p v-else-if="isLoading" class="p-6 text-center text-sm text-slate-500">{{ $t("stockTable.loading") }}</p>

    <div v-else class="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
      <DataTable
        :table="table"
        :empty-text="$t('stockTable.empty')"
        :cell-class="cellClass"
        :row-class="(row) => [row.original.isLowStock ? 'bg-red-50/60' : '', !row.original.isActive ? 'opacity-50' : '']"
      >
        <template #cell-status="{ item }">
          <span
            v-if="item.isLowStock"
            class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700"
          >
            {{ $t("stockTable.lowStock") }}
          </span>
          <span
            v-else
            class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
          >
            {{ $t("stockTable.ok") }}
          </span>
        </template>

        <template #cell-active="{ item }">
          <button
            type="button"
            role="switch"
            :aria-checked="item.isActive"
            :disabled="togglingIds.has(item.id)"
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
            :class="item.isActive ? 'bg-emerald-500' : 'bg-slate-300'"
            @click="toggleActive(item)"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="item.isActive ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </template>

        <template #cell-updated="{ item }">{{ formatUpdatedAt(item.updatedAt) }}</template>

        <template #cell-actions="{ item }">
          <div class="flex justify-end gap-2">
            <IconButton :icon="Warehouse" :label="$t('stockTable.adjust')" @click="emit('adjust', item)" />
            <IconButton :icon="Pencil" :label="$t('common.edit')" @click="emit('edit', item)" />
            <IconButton :icon="Trash2" :label="$t('common.delete')" variant="danger" @click="emit('delete', item)" />
          </div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
