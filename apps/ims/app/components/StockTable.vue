<script setup lang="ts">
import { computed, ref } from "vue";
import { Pencil, Trash2, Warehouse } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { InventoryItem } from "~/types/inventory";
import type { TableFilterDef } from "~/types/table";

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

const togglingIds = ref<Set<string>>(new Set());

const features = tableFeatures({ ...sortingFeatures, ...filteringFeatures });

const columnHelper = createColumnHelper<typeof features, InventoryItem>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", { header: () => t("stockTable.columns.item") }),
  // Numbers stay out of the search box - as text, "5" would match a stock of
  // 500 or a reorder level of 50. The filter panel's ranges cover them.
  columnHelper.accessor("stockQuantity", {
    header: () => t("stockTable.columns.stock"),
    filterFn: "inNumberRange",
    enableGlobalFilter: false,
  }),
  columnHelper.accessor("unit", { header: () => t("stockTable.columns.unit"), filterFn: "equals" }),
  columnHelper.accessor("reorderThreshold", {
    header: () => t("stockTable.columns.reorderAt"),
    filterFn: "inNumberRange",
    enableGlobalFilter: false,
  }),
  // Accessors (for sorting/filtering) but rendered via slots and kept out of
  // the search box - matching "true" or a timestamp would just be noise.
  columnHelper.accessor("isLowStock", {
    id: "status",
    header: () => t("stockTable.columns.status"),
    filterFn: "equals",
    enableGlobalFilter: false,
  }),
  columnHelper.accessor("isActive", {
    id: "active",
    header: () => t("stockTable.columns.active"),
    filterFn: "equals",
    enableGlobalFilter: false,
  }),
  columnHelper.accessor("updatedAt", {
    id: "updated",
    header: () => t("stockTable.columns.updated"),
    filterFn: "inDayRange",
    enableGlobalFilter: false,
  }),
  columnHelper.display({ id: "actions", header: "" }),
]);

const cellClass = {
  status: "px-4 py-3",
  active: "px-4 py-3",
  updated: "px-4 py-3 text-xs text-slate-400",
  actions: "px-4 py-3 text-right",
};

const table = useTable({ features, columns, data: items, globalFilterFn: "includesDisplayText" });

const filters = computed<TableFilterDef[]>(() => [
  { type: "numberRange", columnId: "stockQuantity", label: t("stockTable.columns.stock") },
  {
    type: "select",
    columnId: "unit",
    label: t("stockTable.columns.unit"),
    options: store.units.map((unit) => ({ value: unit, label: unit })),
  },
  { type: "numberRange", columnId: "reorderThreshold", label: t("stockTable.columns.reorderAt") },
  {
    type: "select",
    columnId: "status",
    label: t("stockTable.columns.status"),
    options: [
      { value: true, label: t("stockTable.lowStock") },
      { value: false, label: t("stockTable.ok") },
    ],
  },
  {
    type: "select",
    columnId: "active",
    label: t("stockTable.columns.active"),
    options: [
      { value: true, label: t("stockTable.activeYes") },
      { value: false, label: t("stockTable.activeNo") },
    ],
  },
  { type: "dateRange", columnId: "updated", label: t("stockTable.columns.updated") },
]);

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
      <TableFilters :table="table" :search-placeholder="$t('stockTable.searchPlaceholder')" :filters="filters" />

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
