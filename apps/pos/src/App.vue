<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CategoryTabs from "./components/CategoryTabs.vue";
import ProductGrid from "./components/ProductGrid.vue";
import { fetchCategories, fetchProducts } from "./lib/api";
import type { Category, Product } from "./types/catalog";

const categories = ref<Category[]>([]);
const products = ref<Product[]>([]);
const selectedCategoryId = ref<string | null>(null);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const lastAddedProduct = ref<Product | null>(null);

const filteredProducts = computed(() => {
  if (selectedCategoryId.value === null) {
    return products.value;
  }
  return products.value.filter((product) => product.categoryId === selectedCategoryId.value);
});

function selectCategory(categoryId: string | null) {
  selectedCategoryId.value = categoryId;
}

function handleProductSelect(product: Product) {
  lastAddedProduct.value = product;
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
});
</script>

<template>
  <main class="pos-screen">
    <header class="pos-header">
      <h1 class="pos-header__title">Cafe POS</h1>
      <p v-if="lastAddedProduct" class="pos-header__last-added">
        Added: {{ lastAddedProduct.name }}
      </p>
    </header>

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
  </main>
</template>

<style scoped>
.pos-screen {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.pos-header {
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

.pos-header__last-added {
  margin: 0;
  font-size: 0.9rem;
  color: #9fe6b8;
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
