import { defineStore } from "pinia";
import type { RecipeIngredientRecord, RecipeTarget, RecipeUpdatePayload } from "~/types/recipe";

export const useRecipeStore = defineStore("recipes", {
  state: () => ({
    productRecipeCounts: {} as Record<string, number>,
    // Recipes already opened in the editor, by "product:<id>" / "modifier:<id>".
    // Recipes only change here, so kept for the session (utils/cache.ts).
    recipeCache: {} as Record<string, RecipeIngredientRecord[]>,
    modifierRecipeCounts: {} as Record<string, number>,
    isLoadingCatalog: false,
    hasLoadedCatalog: false,
    catalogError: null as string | null,
  }),

  getters: {
    hasProductRecipe: (state) => (productId: string) => (state.productRecipeCounts[productId] ?? 0) > 0,
    hasModifierRecipe: (state) => (modifierId: string) => (state.modifierRecipeCounts[modifierId] ?? 0) > 0,
  },

  actions: {
    async fetchCatalog() {
      // Categories/products/modifier groups live in useCatalogStore - it's the
      // single source of truth shared with the Menu and Modifiers tabs, so
      // anything created/edited/deleted there is reflected here immediately
      // via the same reactive state, with no separate copy to go stale.
      const catalogStore = useCatalogStore();
      const { fetchRecipeSummary } = useApi();

      this.isLoadingCatalog = true;
      this.catalogError = null;

      try {
        const [summary] = await Promise.all([
          fetchRecipeSummary(useAuth().requireToken()),
          catalogStore.hasLoadedOnce ? Promise.resolve(undefined) : catalogStore.fetchCatalog(),
        ] as const);

        this.productRecipeCounts = Object.fromEntries(summary.products.map((entry) => [entry.id, entry.ingredientCount]));
        this.modifierRecipeCounts = Object.fromEntries(summary.modifiers.map((entry) => [entry.id, entry.ingredientCount]));
        this.hasLoadedCatalog = true;
      } catch (error) {
        this.catalogError = error instanceof Error ? error.message : "Failed to load catalog.";
      } finally {
        this.isLoadingCatalog = false;
      }
    },

    async fetchRecipe(target: RecipeTarget): Promise<RecipeIngredientRecord[]> {
      const key = `${target.kind}:${target.id}`;
      const cached = this.recipeCache[key];
      if (cached) {
        return cached;
      }
      const { fetchRecipe } = useApi();
      const records = await fetchRecipe(target, useAuth().requireToken());
      this.recipeCache = { ...this.recipeCache, [key]: records };
      return records;
    },

    dropCachedRecipe(key: string) {
      const next = { ...this.recipeCache };
      delete next[key];
      this.recipeCache = next;
    },

    async saveRecipe(payload: RecipeUpdatePayload, token: string) {
      const { saveRecipe } = useApi();
      await saveRecipe(payload, token);

      // Update the affected target's count locally rather than refetching the
      // whole summary - the save already tells us exactly what changed. Its
      // cached ingredients are dropped, so the next open shows them as saved.
      this.dropCachedRecipe(payload.productId ? `product:${payload.productId}` : `modifier:${payload.modifierId}`);
      const count = payload.ingredients.length;
      if (payload.productId) {
        this.productRecipeCounts = { ...this.productRecipeCounts, [payload.productId]: count };
      } else if (payload.modifierId) {
        this.modifierRecipeCounts = { ...this.modifierRecipeCounts, [payload.modifierId]: count };
      }
    },

    // A product or modifier option deleted elsewhere - the server dropped its
    // recipe too.
    forgetProduct(productId: string) {
      this.dropCachedRecipe(`product:${productId}`);
      const next = { ...this.productRecipeCounts };
      delete next[productId];
      this.productRecipeCounts = next;
    },

    forgetModifier(modifierId: string) {
      this.dropCachedRecipe(`modifier:${modifierId}`);
      const next = { ...this.modifierRecipeCounts };
      delete next[modifierId];
      this.modifierRecipeCounts = next;
    },

    async deleteRecipe(productId: string, token: string) {
      const { deleteRecipe } = useApi();
      await deleteRecipe(productId, token);
      this.dropCachedRecipe(`product:${productId}`);

      const next = { ...this.productRecipeCounts };
      delete next[productId];
      this.productRecipeCounts = next;
    },
  },
});
