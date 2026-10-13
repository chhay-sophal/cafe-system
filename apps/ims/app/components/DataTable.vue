<script setup lang="ts" generic="TFeatures extends TableFeatures, TData extends RowData">
import { computed } from "vue";
import type { HTMLAttributes } from "vue";
import { FlexRender } from "@tanstack/vue-table";
import type { Row, RowData, TableFeatures, VueTable } from "@tanstack/vue-table";

const props = withDefaults(
  defineProps<{
    table: VueTable<TFeatures, TData>;
    emptyText: string;
    // Per-column <td> classes keyed by column id; columns not listed get the
    // default text cell styling.
    cellClass?: Record<string, string>;
    // Same idea for <th>, e.g. to right-align a numeric column's header.
    headerClass?: Record<string, string>;
    rowClass?: (row: Row<TFeatures, TData>) => HTMLAttributes["class"];
  }>(),
  { cellClass: () => ({}), headerClass: () => ({}) },
);

const emit = defineEmits<{
  rowClick: [item: TData];
}>();

// A `cell-<columnId>` slot, when provided, renders that column's cells in
// place of the column def's own `cell` - handy for badges, toggles and row
// actions, where a template reads better than a render function.
const slots = defineSlots<{
  [key: `cell-${string}`]: (props: { item: TData; row: Row<TFeatures, TData> }) => unknown;
}>();

const DEFAULT_CELL_CLASS = "px-4 py-3 text-slate-700";
const DEFAULT_HEADER_CLASS = "px-4 py-3 text-left font-semibold text-slate-600";

const columnCount = computed(() => props.table.getAllLeafColumns().length);
</script>

<template>
  <table class="min-w-full divide-y divide-slate-200 text-sm">
    <thead class="sticky top-0 z-10 bg-slate-50">
      <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
        <th
          v-for="header in headerGroup.headers"
          :key="header.id"
          :class="headerClass[header.column.id] ?? DEFAULT_HEADER_CLASS"
        >
          <FlexRender v-if="!header.isPlaceholder" :header="header" />
        </th>
      </tr>
    </thead>

    <tbody class="divide-y divide-slate-100 bg-white">
      <tr v-if="table.getRowModel().rows.length === 0">
        <td :colspan="columnCount" class="px-4 py-8 text-center text-slate-400">
          {{ emptyText }}
        </td>
      </tr>

      <tr
        v-for="row in table.getRowModel().rows"
        :key="row.id"
        :class="rowClass?.(row)"
        @click="emit('rowClick', row.original)"
      >
        <td v-for="cell in row.getAllCells()" :key="cell.id" :class="cellClass[cell.column.id] ?? DEFAULT_CELL_CLASS">
          <slot v-if="slots[`cell-${cell.column.id}`]" :name="`cell-${cell.column.id}`" :item="row.original" :row="row" />
          <FlexRender v-else :cell="cell" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
