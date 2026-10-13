<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Pencil } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { TableFilterDef } from "~/types/table";
import type { StaffUser, UserRole } from "~/types/user";

const emit = defineEmits<{
  create: [];
  edit: [user: StaffUser];
}>();

const { t } = useI18n();
const auth = useAuth();
const store = useUserStore();
const { items } = storeToRefs(store);

const features = tableFeatures({ ...sortingFeatures, ...filteringFeatures });
const columnHelper = createColumnHelper<typeof features, StaffUser>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", { header: () => t("staff.table.name") }),
  // Search matches the translated role name shown in the cell.
  columnHelper.accessor("role", {
    header: () => t("staff.table.role"),
    cell: ({ getValue }) => t(`staff.roles.${getValue()}`),
    filterFn: "equals",
  }),
  columnHelper.accessor("isActive", {
    id: "status",
    header: () => t("staff.table.status"),
    filterFn: "equals",
    enableGlobalFilter: false,
  }),
  columnHelper.accessor("createdAt", {
    header: () => t("staff.table.created"),
    cell: ({ getValue }) => formatCreatedAt(getValue()),
    filterFn: "inDayRange",
    enableGlobalFilter: false,
  }),
  columnHelper.display({ id: "actions", header: "" }),
]);

// Name/role have no text colour of their own, so they inherit the row's
// (dimmed for deactivated users - see row-class in the template).
const cellClass = {
  name: "px-4 py-3",
  role: "px-4 py-3",
  status: "px-4 py-3",
  createdAt: "px-4 py-3 text-xs text-slate-400",
  actions: "px-4 py-3 text-right",
};

const table = useTable({ features, columns, data: items, globalFilterFn: "includesDisplayText" });

const ROLES: UserRole[] = ["CASHIER", "BARISTA", "MANAGER", "ADMIN"];

const filters = computed<TableFilterDef[]>(() => [
  {
    type: "select",
    columnId: "role",
    label: t("staff.table.role"),
    options: ROLES.map((role) => ({ value: role, label: t(`staff.roles.${role}`) })),
  },
  {
    type: "select",
    columnId: "status",
    label: t("staff.table.status"),
    options: [
      { value: true, label: t("staff.table.active") },
      { value: false, label: t("staff.table.deactivated") },
    ],
  },
  { type: "dateRange", columnId: "createdAt", label: t("staff.table.created") },
]);

// "No staff accounts yet" would be wrong when accounts exist but the search
// or filters hide them all.
const emptyText = computed(() => (items.value.length > 0 ? t("staff.table.noMatches") : t("staff.table.empty")));

onMounted(() => {
  const token = auth.session.value?.token;
  if (token) {
    store.fetchUsers(token);
  }
});

function formatCreatedAt(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value.replace(" ", "T")).toLocaleDateString();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <TableFilters :table="table" :search-placeholder="$t('staff.table.searchPlaceholder')" :filters="filters" />
      <button
        type="button"
        class="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        @click="emit('create')"
      >
        {{ $t("staff.table.newButton") }}
      </button>
    </div>

    <p v-if="store.error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ store.error }}</p>

    <p v-else-if="store.isLoading" class="p-6 text-center text-sm text-slate-500">{{ $t("staff.table.loading") }}</p>

    <div v-else class="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
      <DataTable
        :table="table"
        :empty-text="emptyText"
        :cell-class="cellClass"
        :row-class="(row) => (row.original.isActive ? 'text-slate-700' : 'bg-slate-50 text-slate-400')"
      >
        <template #cell-status="{ item }">
          <span
            v-if="item.isActive"
            class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
          >
            {{ $t("staff.table.active") }}
          </span>
          <span
            v-else
            class="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
          >
            {{ $t("staff.table.deactivated") }}
          </span>
        </template>

        <template #cell-actions="{ item }">
          <IconButton :icon="Pencil" :label="$t('common.edit')" @click="emit('edit', item)" />
        </template>
      </DataTable>
    </div>
  </div>
</template>
