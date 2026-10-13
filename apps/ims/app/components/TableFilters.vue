<script setup lang="ts" generic="TFeatures extends TableFeatures, TData extends RowData">
import { reactive, ref } from "vue";
import type { RowData, TableFeatures, VueTable } from "@tanstack/vue-table";
import type { TableSelectFilter } from "~/types/table";

// Search box + dropdown filters for a TanStack table. Renders its controls
// without a wrapper, so they sit inline in the parent's toolbar row.
//
// The table needs globalFilteringFeature for the search box and
// columnFilteringFeature (with the column's filterFn, e.g. "equalsString")
// for the dropdowns - see StockTable.vue.
const props = withDefaults(
  defineProps<{
    table: VueTable<TFeatures, TData>;
    // Leave out to hide the search box.
    searchPlaceholder?: string;
    filters?: TableSelectFilter[];
  }>(),
  { filters: () => [] },
);

// The filtering API only exists when the table was built with the filtering
// features, so it's reached through these loose shapes rather than the
// table's own (feature-dependent) types.
interface GlobalFilterable {
  setGlobalFilter: (value: string) => void;
}
interface ColumnFilterable {
  setFilterValue: (value: unknown) => void;
}

const search = ref("");
const filterValues = reactive<Record<string, string>>({});

function handleSearchInput() {
  (props.table as unknown as GlobalFilterable).setGlobalFilter(search.value);
}

function handleFilterChange(columnId: string, value: string) {
  filterValues[columnId] = value;
  const column = props.table.getColumn(columnId) as unknown as ColumnFilterable | undefined;
  column?.setFilterValue(value || undefined);
}

const INPUT_CLASS =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
</script>

<template>
  <input
    v-if="searchPlaceholder !== undefined"
    v-model="search"
    type="search"
    :placeholder="searchPlaceholder"
    :class="INPUT_CLASS"
    class="w-full sm:w-64"
    @input="handleSearchInput"
  />

  <select
    v-for="filter in filters"
    :key="filter.columnId"
    :value="filterValues[filter.columnId] ?? ''"
    :class="INPUT_CLASS"
    @change="handleFilterChange(filter.columnId, ($event.target as HTMLSelectElement).value)"
  >
    <option value="">{{ filter.allLabel }}</option>
    <option v-for="option in filter.options" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>
</template>
