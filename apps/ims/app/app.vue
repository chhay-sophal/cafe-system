<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { InventoryItem } from "~/types/inventory";
import type { StaffUser } from "~/types/user";

const auth = useAuth();
const store = useInventoryStore();

const activeView = ref<"inventory" | "recipes" | "analytics" | "staff">("inventory");
const isAdjustOpen = ref(false);
const selectedItem = ref<InventoryItem | null>(null);
const isItemModalOpen = ref(false);
const editingItem = ref<InventoryItem | null>(null);
const isDeleteOpen = ref(false);
const deletingItem = ref<InventoryItem | null>(null);
const isUserModalOpen = ref(false);
const editingUser = ref<StaffUser | null>(null);

const isAdmin = computed(() => auth.session.value?.user.role === "ADMIN");

function openAdjustModal(item: InventoryItem) {
  selectedItem.value = item;
  isAdjustOpen.value = true;
}

function openCreateModal() {
  editingItem.value = null;
  isItemModalOpen.value = true;
}

function openEditModal(item: InventoryItem) {
  editingItem.value = item;
  isItemModalOpen.value = true;
}

function openDeleteDialog(item: InventoryItem) {
  deletingItem.value = item;
  isDeleteOpen.value = true;
}

function openCreateUserModal() {
  editingUser.value = null;
  isUserModalOpen.value = true;
}

function openEditUserModal(user: StaffUser) {
  editingUser.value = user;
  isUserModalOpen.value = true;
}

onMounted(() => {
  if (auth.session.value) {
    store.fetchInventory();
  }
});

watch(
  () => auth.session.value,
  (session) => {
    if (session) {
      store.fetchInventory();
    }
  },
);
</script>

<template>
  <LoginForm v-if="!auth.session.value" />

  <div v-else class="min-h-screen bg-slate-100">
    <header class="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
      <div class="flex items-center gap-6">
        <h1 class="text-lg font-bold text-slate-900">Inventory Manager</h1>
        <nav class="flex gap-1">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'inventory' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'inventory'"
          >
            Stock
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'recipes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'recipes'"
          >
            Recipes
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'analytics' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'analytics'"
          >
            Analytics
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'staff' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'staff'"
          >
            Staff
          </button>
        </nav>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span class="text-slate-500">{{ auth.session.value.user.name }}</span>
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
          @click="auth.logout()"
        >
          Log out
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl p-6">
      <StockTable
        v-if="activeView === 'inventory'"
        @adjust="openAdjustModal"
        @create="openCreateModal"
        @edit="openEditModal"
        @delete="openDeleteDialog"
      />
      <RecipeEditor v-else-if="activeView === 'recipes'" />
      <UserTable v-else-if="activeView === 'staff' && isAdmin" @create="openCreateUserModal" @edit="openEditUserModal" />
      <AnalyticsDashboard v-else />
    </main>

    <StockAdjustmentModal v-model:open="isAdjustOpen" :item="selectedItem" />
    <InventoryItemModal v-model:open="isItemModalOpen" :item="editingItem" />
    <DeleteConfirmationDialog v-model:open="isDeleteOpen" :item="deletingItem" />
    <UserFormModal v-if="isAdmin" v-model:open="isUserModalOpen" :user="editingUser" />
  </div>
</template>
