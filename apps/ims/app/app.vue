<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { InventoryItem } from "~/types/inventory";

const auth = useAuth();
const store = useInventoryStore();

const activeView = ref<"inventory" | "recipes">("inventory");
const isAdjustOpen = ref(false);
const selectedItem = ref<InventoryItem | null>(null);

function openAdjustModal(item: InventoryItem) {
  selectedItem.value = item;
  isAdjustOpen.value = true;
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
      <StockTable v-if="activeView === 'inventory'" @adjust="openAdjustModal" />
      <RecipeEditor v-else />
    </main>

    <StockAdjustmentModal v-model:open="isAdjustOpen" :item="selectedItem" />
  </div>
</template>
