<script setup lang="ts">
import { computed, ref } from "vue";
import { resolveImageUrl } from "../lib/image";
import type { Product } from "../types/catalog";

const props = defineProps<{
  product: Product;
}>();

const emit = defineEmits<{
  select: [product: Product];
}>();

const imageFailed = ref(false);
const resolvedImageUrl = computed(() => resolveImageUrl(props.product.imageUrl));
const showImage = computed(() => Boolean(resolvedImageUrl.value) && !imageFailed.value);

const formattedPrice = computed(() =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(props.product.basePrice),
);

function handleTap() {
  if (!props.product.isAvailable) {
    return;
  }
  emit("select", props.product);
}
</script>

<template>
  <button
    type="button"
    class="product-card"
    :class="{ 'product-card--unavailable': !product.isAvailable }"
    :disabled="!product.isAvailable"
    :aria-disabled="!product.isAvailable"
    @click="handleTap"
  >
    <div class="product-card__image-wrap">
      <img
        v-if="showImage"
        :src="resolvedImageUrl!"
        :alt="product.name"
        class="product-card__image"
        loading="lazy"
        decoding="async"
        @error="imageFailed = true"
      />
      <div v-else class="product-card__image-fallback" aria-hidden="true">
        {{ product.name.slice(0, 1) }}
      </div>

      <div v-if="!product.isAvailable" class="product-card__badge">Sold Out</div>
    </div>

    <div class="product-card__body">
      <span class="product-card__name">{{ product.name }}</span>
      <span class="product-card__price">{{ formattedPrice }}</span>
    </div>
  </button>
</template>

<style scoped>
.product-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 2px solid var(--border-color, #e2e2e2);
  border-radius: 16px;
  background: #ffffff;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: transform 0.1s ease, box-shadow 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.product-card:active:not(.product-card--unavailable) {
  transform: scale(0.96);
}

.product-card--unavailable {
  cursor: not-allowed;
}

.product-card__image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #f0f0f0;
  overflow: hidden;
}

.product-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.product-card__image-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  font-weight: 700;
  color: #b0b0b0;
  background: #eeeeee;
}

.product-card--unavailable .product-card__image,
.product-card--unavailable .product-card__image-fallback {
  filter: grayscale(0.8);
  opacity: 0.5;
}

.product-card__badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.product-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0.85rem 0.9rem;
}

.product-card__name {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-card__price {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2a7a4f;
}

.product-card--unavailable .product-card__name,
.product-card--unavailable .product-card__price {
  color: #999999;
}

@media (prefers-color-scheme: dark) {
  .product-card {
    background: #242424;
    border-color: #3a3a3a;
  }

  .product-card__image-wrap {
    background: #2f2f2f;
  }

  .product-card__image-fallback {
    background: #333333;
    color: #777777;
  }

  .product-card__name {
    color: #f2f2f2;
  }

  .product-card__price {
    color: #5fd897;
  }

  .product-card--unavailable .product-card__name,
  .product-card--unavailable .product-card__price {
    color: #777777;
  }
}
</style>
