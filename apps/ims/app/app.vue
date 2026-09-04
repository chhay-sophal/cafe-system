<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { Product } from "~/types/catalog";
import type { InventoryItem } from "~/types/inventory";
import type { StaffUser } from "~/types/user";

const { locale, locales, setLocale, t } = useI18n();
const auth = useAuth();
const store = useInventoryStore();
const settingsStore = useSettingsStore();

// detectBrowserLanguage is off (see nuxt.config.ts), which also disables the
// module's own cookie persistence - setLocale() would otherwise silently
// forget the choice on every reload. Persist it ourselves instead, same
// pattern as activeView below.
const LOCALE_STORAGE_KEY = "ims.locale";
type SupportedLocale = "en-US" | "km-KH";

function loadStoredLocale(): SupportedLocale | null {
  if (!import.meta.client) {
    return null;
  }
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "en-US" || stored === "km-KH" ? stored : null;
}

const storedLocale = loadStoredLocale();
if (storedLocale && storedLocale !== locale.value) {
  setLocale(storedLocale);
}

watch(locale, (value) => {
  if (import.meta.client) {
    localStorage.setItem(LOCALE_STORAGE_KEY, value);
  }
});

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

const isDrawerOpen = ref(false);

// Single source of truth for both the desktop horizontal nav and the
// mobile drawer's vertical nav, so the two never drift apart.
const navItems = computed<Array<{ key: ActiveView; label: string }>>(() => {
  const items: Array<{ key: ActiveView; label: string }> = [
    { key: "inventory", label: t("app.nav.stock") },
    { key: "menu", label: t("app.nav.menu") },
    { key: "recipes", label: t("app.nav.recipes") },
    { key: "analytics", label: t("app.nav.analytics") },
  ];
  if (isAdmin.value) {
    items.push({ key: "staff", label: t("app.nav.staff") });
    items.push({ key: "settings", label: t("app.nav.settings") });
  }
  return items;
});

function selectView(view: ActiveView) {
  activeView.value = view;
  isDrawerOpen.value = false;
}

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
    <header class="flex shrink-0 items-center justify-between bg-white px-4 py-4 shadow-sm sm:px-6">
      <div class="flex items-center gap-6">
        <h1 class="text-lg font-bold text-slate-900">{{ $t("app.title") }}</h1>
        <nav class="hidden gap-1 md:flex">
          <button
            v-for="item in navItems"
            :key="item.key"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold"
            :class="activeView === item.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="selectView(item.key)"
          >
            {{ item.label }}
          </button>
        </nav>
      </div>

      <div class="hidden items-center gap-3 text-sm md:flex">
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

      <button
        type="button"
        class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
        :aria-label="$t('app.openMenu')"
        @click="isDrawerOpen = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6">
          <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </header>

    <div v-if="isDrawerOpen" class="fixed inset-0 z-40 bg-black/50 md:hidden" @click="isDrawerOpen = false" />

    <div
      class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col bg-white shadow-xl transition-transform md:hidden"
      :class="isDrawerOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-4">
        <h1 class="text-lg font-bold text-slate-900">{{ $t("app.title") }}</h1>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          :aria-label="$t('common.close')"
          @click="isDrawerOpen = false"
        >
          &times;
        </button>
      </div>

      <nav class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="rounded-lg px-3 py-2.5 text-left text-sm font-semibold"
          :class="activeView === item.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'"
          @click="selectView(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="flex flex-col gap-3 border-t border-slate-200 p-4 text-sm">
        <select
          :value="locale"
          class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          @change="setLocale(($event.target as HTMLSelectElement).value as 'en-US' | 'km-KH')"
        >
          <option v-for="loc in locales" :key="loc.code" :value="loc.code">{{ loc.name }}</option>
        </select>
        <span class="text-slate-500">{{ auth.session.value.user.name }}</span>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
          @click="auth.logout()"
        >
          {{ $t("app.logout") }}
        </button>
      </div>
    </div>

    <main class="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-y-auto p-4 sm:p-6">
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
