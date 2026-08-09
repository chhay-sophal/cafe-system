<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import CartSidebar from "./components/CartSidebar.vue";
import CategoryTabs from "./components/CategoryTabs.vue";
import CheckoutModal from "./components/CheckoutModal.vue";
import LoginScreen from "./components/LoginScreen.vue";
import ModifierModal from "./components/ModifierModal.vue";
import NetworkStatusBar from "./components/NetworkStatusBar.vue";
import ProductGrid from "./components/ProductGrid.vue";
import { useAuth } from "./composables/useAuth";
import { useCart } from "./composables/useCart";
import { useNetworkStatus } from "./composables/useNetworkStatus";
import { useOfflineQueue } from "./composables/useOfflineQueue";
import { fetchCategories, fetchProductModifiers, fetchProducts } from "./lib/api";
import type { Category, Product } from "./types/catalog";
import type { CartModifier, ModifierGroup } from "./types/cart";

const SYNC_RETRY_INTERVAL_MS = 15000;

const categories = ref<Category[]>([]);
const products = ref<Product[]>([]);
const selectedCategoryId = ref<string | null>(null);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const activeModalProduct = ref<Product | null>(null);
const activeModalGroups = ref<ModifierGroup[]>([]);
const isCheckoutOpen = ref(false);

const auth = useAuth();
const cart = useCart();
const network = useNetworkStatus();
const offlineQueue = useOfflineQueue();

const filteredProducts = computed(() => {
  if (selectedCategoryId.value === null) {
    return products.value;
  }
  return products.value.filter((product) => product.categoryId === selectedCategoryId.value);
});

function selectCategory(categoryId: string | null) {
  selectedCategoryId.value = categoryId;
}

async function handleProductSelect(product: Product) {
  let groups: ModifierGroup[] = [];
  try {
    groups = await fetchProductModifiers(product.id);
  } catch (error) {
    console.error("Failed to load modifiers for product", product.id, error);
  }

  if (groups.length === 0) {
    cart.addItem(product, []);
    return;
  }

  activeModalProduct.value = product;
  activeModalGroups.value = groups;
}

function handleModifierConfirm(modifiers: CartModifier[]) {
  if (activeModalProduct.value) {
    cart.addItem(activeModalProduct.value, modifiers);
  }
  activeModalProduct.value = null;
  activeModalGroups.value = [];
}

function handleModifierCancel() {
  activeModalProduct.value = null;
  activeModalGroups.value = [];
}

function handleCheckoutCancel() {
  isCheckoutOpen.value = false;
}

function handleCheckoutDone() {
  isCheckoutOpen.value = false;
  cart.reset();
}

let syncIntervalId: ReturnType<typeof setInterval> | undefined;

function handleOnline() {
  offlineQueue.syncPending();
}

onMounted(async () => {
  try {
    const [categoryList, productList] = await Promise.all([fetchCategories(), fetchProducts()]);
    categories.value = categoryList;
    products.value = productList;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to load menu.";
  } finally {
    isLoading.value = false;
  }

  // Primary trigger: the browser/OS telling us connectivity is back.
  window.addEventListener("online", handleOnline);
  if (network.isOnline.value) {
    offlineQueue.syncPending();
  }

  // Fallback: some outages (server unreachable but interface "online") never
  // fire the online event, so poll while anything is still queued.
  syncIntervalId = setInterval(() => {
    if (offlineQueue.pendingCount.value > 0) {
      offlineQueue.syncPending();
    }
  }, SYNC_RETRY_INTERVAL_MS);
});

onUnmounted(() => {
  window.removeEventListener("online", handleOnline);
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
  }
});
</script>

<template>
  <LoginScreen v-if="!auth.session.value" />

  <main v-else class="pos-screen">
    <header class="pos-header">
      <h1 class="pos-header__title">Cafe POS</h1>
      <div class="pos-header__account">
        <span
          v-if="offlineQueue.pendingCount.value > 0"
          class="pos-header__pending-badge"
        >
          {{ offlineQueue.pendingCount.value }} pending
        </span>
        <span
          class="pos-header__network"
          :class="{ 'pos-header__network--offline': !network.isOnline.value }"
        >
          {{ network.isOnline.value ? "Online" : "Offline" }}
        </span>
        <span class="pos-header__cashier">{{ auth.session.value.user.name }}</span>
        <button type="button" class="pos-header__logout" @click="auth.logout()">Log out</button>
      </div>
    </header>

    <NetworkStatusBar />

    <div class="pos-body">
      <div class="pos-catalog">
        <CategoryTabs
          :categories="categories"
          :selected-category-id="selectedCategoryId"
          @select="selectCategory"
        />

        <ProductGrid
          :products="filteredProducts"
          :is-loading="isLoading"
          :error-message="errorMessage"
          @select="handleProductSelect"
        />
      </div>

      <CartSidebar
        :items="cart.items.value"
        :subtotal="cart.subtotal.value"
        :tax-amount="cart.taxAmount.value"
        :discount-amount="cart.discountAmount.value"
        :total-amount="cart.totalAmount.value"
        @increment="cart.incrementQuantity"
        @decrement="cart.decrementQuantity"
        @remove="cart.removeItem"
        @update:discount="cart.setDiscount"
        @checkout="isCheckoutOpen = true"
      />
    </div>

    <ModifierModal
      v-if="activeModalProduct"
      :product="activeModalProduct"
      :groups="activeModalGroups"
      @confirm="handleModifierConfirm"
      @cancel="handleModifierCancel"
    />

    <CheckoutModal
      v-if="isCheckoutOpen"
      :items="cart.items.value"
      :subtotal="cart.subtotal.value"
      :tax-amount="cart.taxAmount.value"
      :discount-amount="cart.discountAmount.value"
      :total-amount="cart.totalAmount.value"
      :token="auth.session.value.token"
      @cancel="handleCheckoutCancel"
      @done="handleCheckoutDone"
    />
  </main>
</template>

<style scoped>
.pos-screen {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.pos-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #111111;
  color: #ffffff;
}

.pos-header__title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.pos-header__account {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9rem;
}

.pos-header__cashier {
  color: #cccccc;
}

.pos-header__pending-badge {
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: #c0392b;
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 700;
}

.pos-header__network {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6fd08c;
}

.pos-header__network::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.pos-header__network--offline {
  color: #ff8a7a;
}

.pos-header__logout {
  border: 2px solid #444444;
  background: transparent;
  color: #ffffff;
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.pos-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.pos-catalog {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.4;
  font-weight: 400;
  color: #0f0f0f;
  background-color: #f6f6f6;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f6f6f6;
    background-color: #1a1a1a;
  }
}
</style>
