<script setup lang="ts">
import { onMounted } from "vue";
import type { StaffUser } from "~/types/user";

const emit = defineEmits<{
  create: [];
  edit: [user: StaffUser];
}>();

const auth = useAuth();
const store = useUserStore();

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
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("staff.table.name") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("staff.table.role") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("staff.table.status") }}</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">{{ $t("staff.table.created") }}</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="store.items.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-slate-400">{{ $t("staff.table.empty") }}</td>
          </tr>

          <tr v-for="user in store.items" :key="user.id" :class="!user.isActive ? 'bg-slate-50' : ''">
            <td class="px-4 py-3" :class="user.isActive ? 'text-slate-700' : 'text-slate-400'">{{ user.name }}</td>
            <td class="px-4 py-3" :class="user.isActive ? 'text-slate-700' : 'text-slate-400'">{{ $t(`staff.roles.${user.role}`) }}</td>
            <td class="px-4 py-3">
              <span
                v-if="user.isActive"
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
            </td>
            <td class="px-4 py-3 text-xs text-slate-400">{{ formatCreatedAt(user.createdAt) }}</td>
            <td class="px-4 py-3 text-right">
              <button
                type="button"
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                @click="emit('edit', user)"
              >
                {{ $t("common.edit") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
