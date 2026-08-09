<script setup lang="ts">
import type { Product } from "../types/catalog";
import ProductCard from "./ProductCard.vue";

defineProps<{
  products: Product[];
  isLoading: boolean;
  errorMessage: string | null;
}>();

const emit = defineEmits<{
  select: [product: Product];
}>();
</script>

<template>
  <div class="product-grid-wrap">
    <p v-if="errorMessage" class="product-grid__state product-grid__state--error">
      {{ errorMessage }}
    </p>

    <p v-else-if="isLoading" class="product-grid__state">Loading menu...</p>

    <p v-else-if="products.length === 0" class="product-grid__state">
      No items in this category.
    </p>

    <div v-else class="product-grid">
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
        @select="(p) => emit('select', p)"
      />
    </div>
  </div>
</template>

<style scoped>
.product-grid-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
  align-content: start;
}

.product-grid__state {
  text-align: center;
  padding: 3rem 1rem;
  font-size: 1.05rem;
  color: #666666;
}

.product-grid__state--error {
  color: #c0392b;
}

@media (min-width: 1024px) {
  .product-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}

@media (prefers-color-scheme: dark) {
  .product-grid__state {
    color: #aaaaaa;
  }

  .product-grid__state--error {
    color: #ff8a7a;
  }
}
</style>
