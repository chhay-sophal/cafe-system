<script setup lang="ts">
import type { Category } from "../types/catalog";

defineProps<{
  categories: Category[];
  selectedCategoryId: string | null;
}>();

const emit = defineEmits<{
  select: [categoryId: string | null];
}>();
</script>

<template>
  <nav class="category-tabs" aria-label="Product categories">
    <button
      type="button"
      class="category-tab"
      :class="{ 'category-tab--active': selectedCategoryId === null }"
      @click="emit('select', null)"
    >
      All Items
    </button>
    <button
      v-for="category in categories"
      :key="category.id"
      type="button"
      class="category-tab"
      :class="{ 'category-tab--active': selectedCategoryId === category.id }"
      @click="emit('select', category.id)"
    >
      {{ category.name }}
    </button>
  </nav>
</template>

<style scoped>
.category-tabs {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.75rem;
  background: var(--surface-color, #ffffff);
  border-bottom: 2px solid var(--border-color, #e2e2e2);
  scrollbar-width: thin;
}

.category-tab {
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0.75rem 1.5rem;
  border: 2px solid var(--border-color, #d8d8d8);
  border-radius: 999px;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.1s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.category-tab:active {
  transform: scale(0.94);
}

.category-tab--active {
  background: #111111;
  color: #ffffff;
  border-color: #111111;
}

@media (prefers-color-scheme: dark) {
  .category-tabs {
    background: #1c1c1c;
    border-bottom-color: #3a3a3a;
  }

  .category-tab {
    background: #2a2a2a;
    color: #f2f2f2;
    border-color: #444444;
  }

  .category-tab--active {
    background: #ffffff;
    color: #111111;
    border-color: #ffffff;
  }
}
</style>
