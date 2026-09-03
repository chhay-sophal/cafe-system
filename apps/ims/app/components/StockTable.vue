<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  FlexRender,
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
]);

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
        class="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="sticky top-0 z-10 bg-slate-50">
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              class="px-4 py-3 text-left font-semibold text-slate-600"
            >
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("stockTable.columns.status") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("stockTable.columns.active") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("stockTable.columns.updated") }}</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="table.getRowModel().rows.length === 0">
            <td :colspan="columns.length + 4" class="px-4 py-8 text-center text-slate-400">
              {{ $t("stockTable.empty") }}
            </td>
          </tr>

          <tr
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :class="[row.original.isLowStock ? 'bg-red-50/60' : '', !row.original.isActive ? 'opacity-50' : '']"
          >
            <td v-for="cell in row.getAllCells()" :key="cell.id" class="px-4 py-3 text-slate-700">
              <FlexRender :cell="cell" />
            </td>

            <td class="px-4 py-3">
              <span
                v-if="row.original.isLowStock"
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
            </td>

            <td class="px-4 py-3">
              <button
                type="button"
                role="switch"
                :aria-checked="row.original.isActive"
                :disabled="togglingIds.has(row.original.id)"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
                :class="row.original.isActive ? 'bg-emerald-500' : 'bg-slate-300'"
                @click="toggleActive(row.original)"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="row.original.isActive ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </td>

            <td class="px-4 py-3 text-xs text-slate-400">{{ formatUpdatedAt(row.original.updatedAt) }}</td>

            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="emit('adjust', row.original)"
                >
                  {{ $t("stockTable.adjust") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="emit('edit', row.original)"
                >
                  {{ $t("common.edit") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  @click="emit('delete', row.original)"
                >
                  {{ $t("common.delete") }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
