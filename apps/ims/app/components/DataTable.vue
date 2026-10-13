<script setup lang="ts" generic="TFeatures extends TableFeatures, TData extends RowData">
import { computed } from "vue";
import type { HTMLAttributes } from "vue";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "@lucide/vue";
import { FlexRender } from "@tanstack/vue-table";
import type { Cell, Column, Row, RowData, TableFeatures, VueTable } from "@tanstack/vue-table";

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

// Hidden columns (columnVisibilityFeature) are left out of the cells and
// colspan; header groups already skip them. Tables without the feature lack
// these methods, so every column counts as visible.
interface VisibilityAwareTable {
  getVisibleLeafColumns?: () => unknown[];
}
interface VisibilityAwareRow {
  getVisibleCells?: () => Array<Cell<TFeatures, TData, unknown>>;
}

function visibleCells(row: Row<TFeatures, TData>) {
  return (row as unknown as VisibilityAwareRow).getVisibleCells?.() ?? row.getAllCells();
}

const columnCount = computed(
  () =>
    (props.table as unknown as VisibilityAwareTable).getVisibleLeafColumns?.().length ??
    props.table.getAllLeafColumns().length,
);

const { t } = useI18n();

// The sorting API only exists on columns of tables built with
// sortingFeatures (see utils/table.ts), and only accessor columns can sort -
// so check at runtime rather than requiring every table to opt in.
interface SortableColumn {
  getCanSort: () => boolean;
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => undefined | ((event: unknown) => void);
}

function sortableColumn(column: Column<TFeatures, TData, unknown>): SortableColumn | null {
  const candidate = column as unknown as Partial<SortableColumn>;
  return typeof candidate.getCanSort === "function" && candidate.getCanSort() ? (candidate as SortableColumn) : null;
}

function sortLabel(column: SortableColumn) {
  const direction = column.getIsSorted();
  if (direction === "asc") {
    return t("common.sortedAscending");
  }
  if (direction === "desc") {
    return t("common.sortedDescending");
  }
  return t("common.sort");
}
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
          <div v-if="!header.isPlaceholder" class="inline-flex items-center gap-1">
            <FlexRender :header="header" />
            <button
              v-if="sortableColumn(header.column)"
              type="button"
              :title="sortLabel(sortableColumn(header.column)!)"
              :aria-label="sortLabel(sortableColumn(header.column)!)"
              class="rounded p-0.5 hover:bg-slate-200"
              :class="sortableColumn(header.column)!.getIsSorted() ? 'text-slate-700' : 'text-slate-400'"
              @click="sortableColumn(header.column)!.getToggleSortingHandler()?.($event)"
            >
              <ChevronUp v-if="sortableColumn(header.column)!.getIsSorted() === 'asc'" class="h-4 w-4" aria-hidden="true" />
              <ChevronDown v-else-if="sortableColumn(header.column)!.getIsSorted() === 'desc'" class="h-4 w-4" aria-hidden="true" />
              <ChevronsUpDown v-else class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
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
        <td v-for="cell in visibleCells(row)" :key="cell.id" :class="cellClass[cell.column.id] ?? DEFAULT_CELL_CLASS">
          <slot v-if="slots[`cell-${cell.column.id}`]" :name="`cell-${cell.column.id}`" :item="row.original" :row="row" />
          <FlexRender v-else :cell="cell" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
