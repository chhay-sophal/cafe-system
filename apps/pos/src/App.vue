<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CartSidebar from "./components/CartSidebar.vue";
import CategoryTabs from "./components/CategoryTabs.vue";
import CheckoutModal from "./components/CheckoutModal.vue";
import LoginScreen from "./components/LoginScreen.vue";
import ModifierModal from "./components/ModifierModal.vue";
import NetworkStatusBar from "./components/NetworkStatusBar.vue";
import ProductGrid from "./components/ProductGrid.vue";
import SalesHistory from "./components/SalesHistory.vue";
import SettingsView from "./components/SettingsView.vue";
import { checkForUpdateAndInstall } from "./composables/useAppUpdater";
import { useAuth } from "./composables/useAuth";
import { useCart } from "./composables/useCart";
import {
  onRequestSync,
  publishCartUpdate,
  publishLocaleChange,
  publishThemeChange,
  type CartUpdatePayload,
  type DisplayLocale,
} from "./composables/useCustomerDisplayChannel";
import { useExchangeRate } from "./composables/useExchangeRate";
import { useNetworkStatus } from "./composables/useNetworkStatus";
import { useTheme } from "./composables/useTheme";
import { useOfflineQueue } from "./composables/useOfflineQueue";
import { fetchCategories, fetchProductModifiers, fetchProducts } from "./lib/api";
import type { Category, Product } from "./types/catalog";
import type { CartModifier, ModifierGroup } from "./types/cart";

const SYNC_RETRY_INTERVAL_MS = 15000;

const { t, locale } = useI18n({ useScope: "global" });

const categories = ref<Category[]>([]);
const products = ref<Product[]>([]);
const selectedCategoryId = ref<string | null>(null);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const activeModalProduct = ref<Product | null>(null);
const activeModalGroups = ref<ModifierGroup[]>([]);
const isCheckoutOpen = ref(false);
const activeView = ref<"register" | "salesHistory" | "settings">("register");

const auth = useAuth();
const cart = useCart();
const network = useNetworkStatus();
const offlineQueue = useOfflineQueue();
const exchangeRate = useExchangeRate();

// Mirrored to the customer-facing display over Tauri's event bus (see
// composables/useCustomerDisplayChannel.ts) - the second window has no
// access to this cart state otherwise, being a separate webview.
const cartUpdatePayload = computed<CartUpdatePayload>(() => ({
  items: cart.items.value.map((item) => {
    const unitPrice = cart.lineUnitPrice(item);
    return {
      cartItemId: item.cartItemId,
      productName: item.productName,
      modifierNames: item.modifiers.map((modifier) => modifier.name),
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
    };
  }),
  discountAmount: cart.discountAmount.value,
  totalAmount: cart.totalAmount.value,
}));

watch(cartUpdatePayload, publishCartUpdate, { immediate: true });

// Language changes (Settings → General) reach the customer display live.
watch(locale, (newLocale) => publishLocaleChange(newLocale as DisplayLocale));

// ...and so do appearance changes.
const { preference: themePreference } = useTheme();
watch(themePreference, publishThemeChange);

let unlistenRequestSync: (() => void) | undefined;

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
  // Cold start, before login and before any order is in progress - the
  // safe moment for a silent self-update-and-relaunch.
  checkForUpdateAndInstall();

  try {
    const [categoryList, productList] = await Promise.all([
      fetchCategories(),
      fetchProducts(),
      exchangeRate.refreshExchangeRate(),
    ]);
    categories.value = categoryList;
    products.value = productList;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("app.loadError");
  } finally {
    isLoading.value = false;
  }

  // A freshly (re)opened customer-display window has missed every prior
  // cart-update, so it asks for a resync on its own mount - answer with
  // the live cart instead of leaving it blank.
  onRequestSync(() => publishCartUpdate(cartUpdatePayload.value)).then((unlisten) => {
    unlistenRequestSync = unlisten;
  });

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
  unlistenRequestSync?.();
});
</script>

<template>
  <LoginScreen v-if="!auth.session.value" />

  <main v-else class="pos-screen">
    <header class="pos-header">
      <div class="pos-header__nav">
        <h1 class="pos-header__title">{{ t("app.title") }}</h1>
        <nav class="pos-header__tabs">
          <button
            type="button"
            class="pos-header__tab"
            :class="{ 'pos-header__tab--active': activeView === 'register' }"
            @click="activeView = 'register'"
          >
            {{ t("app.register") }}
          </button>
          <button
            type="button"
            class="pos-header__tab"
            :class="{ 'pos-header__tab--active': activeView === 'salesHistory' }"
            @click="activeView = 'salesHistory'"
          >
            {{ t("salesHistory.heading") }}
          </button>
          <button
            type="button"
            class="pos-header__tab"
            :class="{ 'pos-header__tab--active': activeView === 'settings' }"
            @click="activeView = 'settings'"
          >
            {{ t("settings.heading") }}
          </button>
        </nav>
      </div>
      <div class="pos-header__account">
        <span
          v-if="offlineQueue.pendingCount.value > 0"
          class="pos-header__pending-badge"
        >
          {{ t("app.pendingBadge", { count: offlineQueue.pendingCount.value }) }}
        </span>
        <span
          class="pos-header__network"
          :class="{ 'pos-header__network--offline': !network.isOnline.value }"
        >
          {{ network.isOnline.value ? t("app.online") : t("app.offline") }}
        </span>
        <span class="pos-header__cashier">{{ auth.session.value.user.name }}</span>
        <button type="button" class="pos-header__logout" @click="auth.logout()">{{ t("app.logout") }}</button>
      </div>
    </header>

    <NetworkStatusBar />

    <SalesHistory v-if="activeView === 'salesHistory'" :token="auth.session.value.token" />
    <SettingsView v-if="activeView === 'settings'" />

    <!-- v-show, not v-if: the cart and catalog must survive a trip to the
         Sales History tab mid-order. -->
    <div v-show="activeView === 'register'" class="pos-body">
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

.pos-header__nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.pos-header__tabs {
  display: flex;
  gap: 0.25rem;
}

.pos-header__tab {
  border: none;
  background: transparent;
  color: #aaaaaa;
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.pos-header__tab--active {
  background: #ffffff;
  color: #111111;
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
