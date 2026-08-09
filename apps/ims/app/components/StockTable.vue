<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  FlexRender,
  columnFilteringFeature,
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
}>();

const store = useInventoryStore();
const { items, isLoading, error } = storeToRefs(store);

const search = ref("");
const unitFilter = ref("");

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString },
});

const columns = [
  { accessorKey: "name", header: "Item" },
  { accessorKey: "stockQuantity", header: "Stock" },
  { accessorKey: "unit", header: "Unit", filterFn: "equalsString" as const },
  { accessorKey: "reorderThreshold", header: "Reorder At" },
];

const table = useTable({ features, columns, data: items });

function handleSearchInput() {
  table.setGlobalFilter(search.value);
}

function handleUnitFilterChange() {
  table.getColumn("unit")?.setFilterValue(unitFilter.value || undefined);
}

const units = computed(() => store.units);

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value.replace(" ", "T")).toLocaleString();
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <input
        v-model="search"
        type="search"
        placeholder="Search items..."
        class="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        @input="handleSearchInput"
      />

      <select
        v-model="unitFilter"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        @change="handleUnitFilterChange"
      >
        <option value="">All units</option>
        <option v-for="unit in units" :key="unit" :value="unit">{{ unit }}</option>
      </select>

      <span v-if="store.lowStockCount > 0" class="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
        {{ store.lowStockCount }} low stock
      </span>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ error }}</p>

    <p v-else-if="isLoading" class="p-6 text-center text-sm text-slate-500">Loading inventory...</p>

    <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              class="px-4 py-3 text-left font-semibold text-slate-600"
            >
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Updated</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="table.getRowModel().rows.length === 0">
            <td :colspan="columns.length + 3" class="px-4 py-8 text-center text-slate-400">
              No inventory items match your filters.
            </td>
          </tr>

          <tr
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :class="row.original.isLowStock ? 'bg-red-50/60' : ''"
          >
            <td v-for="cell in row.getAllCells()" :key="cell.id" class="px-4 py-3 text-slate-700">
              <FlexRender :cell="cell" />
            </td>

            <td class="px-4 py-3">
              <span
                v-if="row.original.isLowStock"
                class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700"
              >
                Low Stock
              </span>
              <span
                v-else
                class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
              >
                OK
              </span>
            </td>

            <td class="px-4 py-3 text-xs text-slate-400">{{ formatUpdatedAt(row.original.updatedAt) }}</td>

            <td class="px-4 py-3 text-right">
              <button
                type="button"
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                @click="emit('adjust', row.original)"
              >
                Adjust
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
