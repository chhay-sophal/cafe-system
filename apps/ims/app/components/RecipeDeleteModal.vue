<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Product } from "~/types/catalog";

const props = defineProps<{
  product: Product | null;
}>();

const emit = defineEmits<{
  deleted: [productId: string];
}>();

const open = defineModel<boolean>("open", { default: false });

const auth = useAuth();
const recipeStore = useRecipeStore();

const isDeleting = ref(false);
const errorMessage = ref<string | null>(null);

const ingredientCount = computed(() => (props.product ? recipeStore.productRecipeCounts[props.product.id] ?? 0 : 0));

watch(open, (isOpen) => {
  if (isOpen) {
    errorMessage.value = null;
  }
});

function close() {
  open.value = false;
}

async function confirmDelete() {
  if (!props.product || isDeleting.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    errorMessage.value = "Your session has expired. Please sign in again.";
    return;
  }

  isDeleting.value = true;
  errorMessage.value = null;

  try {
    await recipeStore.deleteRecipe(props.product.id, token);
    emit("deleted", props.product.id);
    open.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to delete recipe.";
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div v-if="open && product" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold text-slate-900">Delete Recipe</h2>
      <p class="mt-2 text-sm text-slate-600">
        Remove the recipe for <span class="font-semibold">{{ product.name }}</span>? This deletes all
        {{ ingredientCount }} ingredient link(s). The product itself stays on the menu - you can add a new recipe
        for it at any time.
      </p>

      <p v-if="errorMessage" class="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
        {{ errorMessage }}
      </p>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="isDeleting"
          class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="confirmDelete"
        >
          {{ isDeleting ? "Deleting..." : "Delete Recipe" }}
        </button>
      </div>
    </div>
  </div>
</template>
