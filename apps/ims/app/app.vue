<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { Product } from "~/types/catalog";
import type { InventoryItem } from "~/types/inventory";
import type { StaffUser } from "~/types/user";

const { locale, locales, setLocale } = useI18n();
const auth = useAuth();
const store = useInventoryStore();
const settingsStore = useSettingsStore();

type ActiveView = "inventory" | "menu" | "recipes" | "analytics" | "staff" | "settings";

const ACTIVE_VIEW_STORAGE_KEY = "ims.activeView";
const ACTIVE_VIEWS: ActiveView[] = ["inventory", "menu", "recipes", "analytics", "staff", "settings"];

function loadStoredActiveView(): ActiveView {
  if (!import.meta.client) {
    return "inventory";
  }

  const stored = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
  return ACTIVE_VIEWS.includes(stored as ActiveView) ? (stored as ActiveView) : "inventory";
}

const activeView = ref<ActiveView>(loadStoredActiveView());

watch(activeView, (view) => {
  if (import.meta.client) {
    localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view);
  }
});

const isAdjustOpen = ref(false);
const selectedItem = ref<InventoryItem | null>(null);
const isItemModalOpen = ref(false);
const editingItem = ref<InventoryItem | null>(null);
const isDeleteOpen = ref(false);
const deletingItem = ref<InventoryItem | null>(null);
const isUserModalOpen = ref(false);
const editingUser = ref<StaffUser | null>(null);

const isProductModalOpen = ref(false);
const editingProduct = ref<Product | null>(null);
const isProductDeleteOpen = ref(false);
const deletingProduct = ref<Product | null>(null);
const isCategoryModalOpen = ref(false);

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

function openCreateProductModal() {
  editingProduct.value = null;
  isProductModalOpen.value = true;
}

function openEditProductModal(product: Product) {
  editingProduct.value = product;
  isProductModalOpen.value = true;
}

function openProductDeleteDialog(product: Product) {
  deletingProduct.value = product;
  isProductDeleteOpen.value = true;
}

// A restored tab can outlive the session that set it - e.g. an admin left
// the Settings tab active, logged out, and a manager (not admin) later logs
// in on the same browser - so re-validate against the current role too.
function ensureValidActiveView() {
  if ((activeView.value === "staff" || activeView.value === "settings") && !isAdmin.value) {
    activeView.value = "inventory";
  }
}

onMounted(() => {
  if (auth.session.value) {
    store.fetchInventory();
    settingsStore.fetchExchangeRate();
    ensureValidActiveView();
  }
});

watch(
  () => auth.session.value,
  (session) => {
    if (session) {
      store.fetchInventory();
      settingsStore.fetchExchangeRate();
      ensureValidActiveView();
    }
  },
);
</script>

<template>
  <LoginForm v-if="!auth.session.value" />

  <div v-else class="flex h-screen flex-col bg-slate-100">
    <header class="flex shrink-0 items-center justify-between bg-white px-6 py-4 shadow-sm">
      <div class="flex items-center gap-6">
        <h1 class="text-lg font-bold text-slate-900">{{ $t("app.title") }}</h1>
        <nav class="flex gap-1">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'inventory' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'inventory'"
          >
            {{ $t("app.nav.stock") }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'menu' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'menu'"
          >
            {{ $t("app.nav.menu") }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'recipes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'recipes'"
          >
            {{ $t("app.nav.recipes") }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'analytics' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'analytics'"
          >
            {{ $t("app.nav.analytics") }}
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'staff' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'staff'"
          >
            {{ $t("app.nav.staff") }}
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === 'settings' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="activeView = 'settings'"
          >
            {{ $t("app.nav.settings") }}
          </button>
        </nav>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <select
          :value="locale"
          class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          @change="setLocale(($event.target as HTMLSelectElement).value as 'en-US' | 'km-KH')"
        >
          <option v-for="loc in locales" :key="loc.code" :value="loc.code">{{ loc.name }}</option>
        </select>
        <span class="text-slate-500">{{ auth.session.value.user.name }}</span>
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
          @click="auth.logout()"
        >
          {{ $t("app.logout") }}
        </button>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-y-auto p-6">
      <StockTable
        v-if="activeView === 'inventory'"
        @adjust="openAdjustModal"
        @create="openCreateModal"
        @edit="openEditModal"
        @delete="openDeleteDialog"
      />
      <ProductTable
        v-else-if="activeView === 'menu'"
        @create="openCreateProductModal"
        @edit="openEditProductModal"
        @delete="openProductDeleteDialog"
        @manage-categories="isCategoryModalOpen = true"
      />
      <RecipeEditor v-else-if="activeView === 'recipes'" />
      <UserTable v-else-if="activeView === 'staff' && isAdmin" @create="openCreateUserModal" @edit="openEditUserModal" />
      <SettingsPanel v-else-if="activeView === 'settings' && isAdmin" />
      <AnalyticsDashboard v-else />
    </main>

    <StockAdjustmentModal v-model:open="isAdjustOpen" :item="selectedItem" />
    <InventoryItemModal v-model:open="isItemModalOpen" :item="editingItem" />
    <DeleteConfirmationDialog v-model:open="isDeleteOpen" :item="deletingItem" />
    <UserFormModal v-if="isAdmin" v-model:open="isUserModalOpen" :user="editingUser" />
    <ProductFormModal v-model:open="isProductModalOpen" :product="editingProduct" />
    <ProductDeleteConfirmModal v-model:open="isProductDeleteOpen" :product="deletingProduct" />
    <CategoryManagementModal v-model:open="isCategoryModalOpen" />
  </div>
</template>
