<script setup lang="ts" generic="TFeatures extends TableFeatures, TData extends RowData">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { Funnel } from "@lucide/vue";
import type { RowData, TableFeatures, VueTable } from "@tanstack/vue-table";
import type { TableFilterDef } from "~/types/table";

// Search box + a filter button whose dropdown panel holds the caller-defined
// filters. Renders without a wrapper, so the controls sit inline in the
// parent's toolbar row. The table needs filteringFeatures from
// utils/table.ts, and each filtered column the filterFn its TableFilterDef
// type calls for - see StockTable.vue.
const props = withDefaults(
  defineProps<{
    table: VueTable<TFeatures, TData>;
    // Leave out to hide the search box.
    searchPlaceholder?: string;
    filters?: TableFilterDef[];
  }>(),
  { filters: () => [] },
);

const { t } = useI18n();

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

// Per column id: the chosen option's index for a select ("" = any), or the
// [min, max] / [from, to] input strings for a range ("" = open-ended).
interface FilterState {
  select: Record<string, string>;
  range: Record<string, [string, string]>;
}

// The panel edits `draft`; only Apply copies it into `applied` and onto the
// table. Reopening the panel starts from `applied` again, so edits left
// without pressing Apply are discarded.
const applied = reactive<FilterState>({ select: {}, range: {} });
const draft = reactive<FilterState>({ select: {}, range: {} });

const isOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);

function handleSearchInput() {
  (props.table as unknown as GlobalFilterable).setGlobalFilter(search.value);
}

function setColumnFilter(columnId: string, value: unknown) {
  const column = props.table.getColumn(columnId) as unknown as ColumnFilterable | undefined;
  column?.setFilterValue(value);
}

function copyState(from: FilterState, to: FilterState) {
  to.select = { ...from.select };
  to.range = Object.fromEntries(Object.entries(from.range).map(([id, range]) => [id, [...range]]));
}

function rangeOf(state: FilterState, columnId: string): [string, string] {
  return state.range[columnId] ?? ["", ""];
}

function handleSelectChange(filter: TableFilterDef, index: string) {
  draft.select[filter.columnId] = index;
}

function handleRangeChange(filter: TableFilterDef, end: 0 | 1, value: string) {
  const next: [string, string] = [...rangeOf(draft, filter.columnId)];
  next[end] = value;
  draft.range[filter.columnId] = next;
}

// The table filter value a filter's state translates to; undefined = none.
function filterValueOf(state: FilterState, filter: TableFilterDef): unknown {
  if (filter.type === "select") {
    const index = state.select[filter.columnId] ?? "";
    return index === "" ? undefined : filter.options[Number(index)]?.value;
  }

  const range = rangeOf(state, filter.columnId);
  if (!range[0] && !range[1]) {
    return undefined;
  }
  // null = open-ended: inNumberRange reads it as -Infinity / Infinity, and
  // inDayRange skips that end of the comparison.
  return filter.type === "numberRange"
    ? range.map((v) => (v === "" ? null : Number(v)))
    : range.map((v) => v || null);
}

function countActive(state: FilterState) {
  return props.filters.filter((filter) => filterValueOf(state, filter) !== undefined).length;
}

const activeCount = computed(() => countActive(applied));
const draftCount = computed(() => countActive(draft));

function togglePanel() {
  if (!isOpen.value) {
    copyState(applied, draft);
  }
  isOpen.value = !isOpen.value;
}

function clearAll() {
  draft.select = {};
  draft.range = {};
}

function apply() {
  copyState(draft, applied);
  for (const filter of props.filters) {
    setColumnFilter(filter.columnId, filterValueOf(applied, filter));
  }
  isOpen.value = false;
}

function handleDocumentClick(event: MouseEvent) {
  if (isOpen.value && rootEl.value && !rootEl.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("keydown", handleKeydown);
});

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

  <div v-if="filters.length > 0" ref="rootEl" class="relative">
    <button
      type="button"
      :title="t('tableFilters.button')"
      :aria-label="t('tableFilters.button')"
      :aria-expanded="isOpen"
      class="relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border hover:bg-slate-100"
      :class="activeCount > 0 ? 'border-slate-500 text-slate-900' : 'border-slate-300 text-slate-600'"
      @click="togglePanel"
    >
      <Funnel class="h-4 w-4" aria-hidden="true" />
      <span
        v-if="activeCount > 0"
        class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-semibold text-white"
      >
        {{ activeCount }}
      </span>
    </button>

    <div
      v-if="isOpen"
      class="absolute left-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
    >
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-900">{{ t("tableFilters.heading") }}</h3>
        <button
          type="button"
          :disabled="draftCount === 0"
          class="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          @click="clearAll"
        >
          {{ t("tableFilters.clearAll") }}
        </button>
      </div>

      <div class="max-h-[60vh] space-y-3 overflow-y-auto">
        <div v-for="filter in filters" :key="filter.columnId">
          <label class="block text-xs font-medium text-slate-600">{{ filter.label }}</label>

          <select
            v-if="filter.type === 'select'"
            :value="draft.select[filter.columnId] ?? ''"
            :class="INPUT_CLASS"
            class="mt-1 w-full"
            @change="handleSelectChange(filter, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t("tableFilters.any") }}</option>
            <option v-for="(option, index) in filter.options" :key="index" :value="String(index)">{{ option.label }}</option>
          </select>

          <div v-else class="mt-1 grid grid-cols-2 gap-2">
            <input
              :type="filter.type === 'numberRange' ? 'number' : 'date'"
              :value="rangeOf(draft, filter.columnId)[0]"
              :placeholder="filter.type === 'numberRange' ? t('tableFilters.min') : undefined"
              :aria-label="`${filter.label} - ${filter.type === 'numberRange' ? t('tableFilters.min') : t('tableFilters.from')}`"
              :class="INPUT_CLASS"
              class="w-full min-w-0"
              @input="handleRangeChange(filter, 0, ($event.target as HTMLInputElement).value)"
            />
            <input
              :type="filter.type === 'numberRange' ? 'number' : 'date'"
              :value="rangeOf(draft, filter.columnId)[1]"
              :placeholder="filter.type === 'numberRange' ? t('tableFilters.max') : undefined"
              :aria-label="`${filter.label} - ${filter.type === 'numberRange' ? t('tableFilters.max') : t('tableFilters.to')}`"
              :class="INPUT_CLASS"
              class="w-full min-w-0"
              @input="handleRangeChange(filter, 1, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </div>

      <div class="mt-4 flex justify-end border-t border-slate-100 pt-3">
        <button
          type="button"
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          @click="apply"
        >
          {{ t("tableFilters.apply") }}
        </button>
      </div>
    </div>
  </div>
</template>
