<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { StaffUser } from "~/types/user";

const emit = defineEmits<{
  create: [];
  edit: [user: StaffUser];
}>();

const { t } = useI18n();
const auth = useAuth();
const store = useUserStore();
const { items } = storeToRefs(store);

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, StaffUser>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", { header: () => t("staff.table.name") }),
  columnHelper.accessor("role", {
    header: () => t("staff.table.role"),
    cell: ({ getValue }) => t(`staff.roles.${getValue()}`),
  }),
  columnHelper.display({ id: "status", header: () => t("staff.table.status") }),
  columnHelper.accessor("createdAt", {
    header: () => t("staff.table.created"),
    cell: ({ getValue }) => formatCreatedAt(getValue()),
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

const table = useTable({ features, columns, data: items });

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
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-700">{{ $t("staff.table.heading") }}</h2>
      <button
        type="button"
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
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
        :empty-text="$t('staff.table.empty')"
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
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            @click="emit('edit', item)"
          >
            {{ $t("common.edit") }}
          </button>
        </template>
      </DataTable>
    </div>
  </div>
</template>
