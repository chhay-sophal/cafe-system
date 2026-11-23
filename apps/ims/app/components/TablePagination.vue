<script setup lang="ts">
import { computed, watch } from "vue";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "@lucide/vue";

// Pager for a table built with paginationFeatures (utils/table.ts): place it
// under the table's scroll container. Hidden while everything fits on one
// page, so small tables look exactly as before.

// Only the pagination API is used, so take any table that has it rather than
// threading DataTable's generics through.
interface PaginatedTable {
  // TanStack Table v9 has no getState(): each state slice is an atom, and the
  // Vue adapter's atoms are refs, so reading one in a computed is reactive.
  atoms: { pagination: { get: () => { pageIndex: number; pageSize: number } } };
  getRowCount: () => number;
  getPageCount: () => number;
  getCanPreviousPage: () => boolean;
  getCanNextPage: () => boolean;
  firstPage: () => void;
  previousPage: () => void;
  nextPage: () => void;
  lastPage: () => void;
  setPageSize: (size: number) => void;
  setPageIndex: (index: number) => void;
}

const props = defineProps<{
  table: unknown;
}>();

const PAGE_SIZES = [25, 50, 100];

const { t } = useI18n();
const table = computed(() => props.table as PaginatedTable);

const pagination = computed(() => table.value.atoms.pagination.get());
const rowCount = computed(() => table.value.getRowCount());
const pageCount = computed(() => table.value.getPageCount());
// Shown once there's more than the smallest page size, so the page size can
// still be changed back after picking a bigger one.
const isVisible = computed(() => rowCount.value > PAGE_SIZES[0]!);

// Back to page 1 whenever the set of matching rows changes size - a search,
// a filter, a new date range - so a narrowed result is never an empty page
// 3. A refresh that brings back the same number of rows keeps the page. This
// replaces TanStack's autoResetPageIndex (tables pass `false`), which in v9
// skipped filter changes and could reset late, undoing a page click.
watch(rowCount, () => table.value.setPageIndex(0));

const firstRow = computed(() => (rowCount.value === 0 ? 0 : pagination.value.pageIndex * pagination.value.pageSize + 1));
const lastRow = computed(() => Math.min((pagination.value.pageIndex + 1) * pagination.value.pageSize, rowCount.value));

function changePageSize(event: Event) {
  table.value.setPageSize(Number((event.target as HTMLSelectElement).value));
}

const BUTTON_CLASS =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
</script>

<template>
  <div v-if="isVisible" class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
    <p>{{ t("pagination.showing", { from: firstRow, to: lastRow, total: rowCount }) }}</p>

    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2">
        <span>{{ t("pagination.rowsPerPage") }}</span>
        <select
          :value="pagination.pageSize"
          class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          @change="changePageSize"
        >
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

      <div class="flex items-center gap-1">
        <button type="button" :class="BUTTON_CLASS" :disabled="!table.getCanPreviousPage()" :aria-label="t('pagination.first')" :title="t('pagination.first')" @click="table.firstPage()">
          <ChevronsLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" :class="BUTTON_CLASS" :disabled="!table.getCanPreviousPage()" :aria-label="t('pagination.previous')" :title="t('pagination.previous')" @click="table.previousPage()">
          <ChevronLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <span class="px-2 tabular-nums" aria-live="polite">
          {{ t("pagination.page", { page: pagination.pageIndex + 1, pages: Math.max(pageCount, 1) }) }}
        </span>
        <button type="button" :class="BUTTON_CLASS" :disabled="!table.getCanNextPage()" :aria-label="t('pagination.next')" :title="t('pagination.next')" @click="table.nextPage()">
          <ChevronRight class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" :class="BUTTON_CLASS" :disabled="!table.getCanNextPage()" :aria-label="t('pagination.last')" :title="t('pagination.last')" @click="table.lastPage()">
          <ChevronsRight class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
