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
  <div>
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-slate-700">Staff Accounts</h2>
      <button
        type="button"
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        @click="emit('create')"
      >
        + New Staff Member
      </button>
    </div>

    <p v-if="store.error" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ store.error }}</p>

    <p v-else-if="store.isLoading" class="p-6 text-center text-sm text-slate-500">Loading staff...</p>

    <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Role</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Created</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="store.items.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-slate-400">No staff accounts yet.</td>
          </tr>

          <tr v-for="user in store.items" :key="user.id" :class="!user.isActive ? 'bg-slate-50' : ''">
            <td class="px-4 py-3" :class="user.isActive ? 'text-slate-700' : 'text-slate-400'">{{ user.name }}</td>
            <td class="px-4 py-3" :class="user.isActive ? 'text-slate-700' : 'text-slate-400'">{{ user.role }}</td>
            <td class="px-4 py-3">
              <span
                v-if="user.isActive"
                class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
              >
                Active
              </span>
              <span
                v-else
                class="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
              >
                Deactivated
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-400">{{ formatCreatedAt(user.createdAt) }}</td>
            <td class="px-4 py-3 text-right">
              <button
                type="button"
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                @click="emit('edit', user)"
              >
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
