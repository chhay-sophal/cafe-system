import { defineStore } from "pinia";
import type { Category, ModifierGroup, Product } from "~/types/catalog";
import type { RecipeIngredientRecord, RecipeTarget, RecipeUpdatePayload } from "~/types/recipe";

export const useRecipeStore = defineStore("recipes", {
  state: () => ({
    categories: [] as Category[],
    products: [] as Product[],
    modifierGroups: [] as ModifierGroup[],
    productRecipeCounts: {} as Record<string, number>,
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
      const { fetchCategories, fetchProducts, fetchModifiers, fetchRecipeSummary } = useApi();
      this.isLoadingCatalog = true;
      this.catalogError = null;

      try {
        const [categories, products, modifierGroups, summary] = await Promise.all([
          fetchCategories(),
          fetchProducts(),
          fetchModifiers(),
          fetchRecipeSummary(),
        ]);

        this.categories = categories;
        this.products = products;
        this.modifierGroups = modifierGroups;
        this.productRecipeCounts = Object.fromEntries(summary.products.map((entry) => [entry.id, entry.ingredientCount]));
        this.modifierRecipeCounts = Object.fromEntries(summary.modifiers.map((entry) => [entry.id, entry.ingredientCount]));
        this.hasLoadedCatalog = true;
      } catch (error) {
        this.catalogError = error instanceof Error ? error.message : "Failed to load catalog.";
      } finally {
        this.isLoadingCatalog = false;
      }
    },

    fetchRecipe(target: RecipeTarget): Promise<RecipeIngredientRecord[]> {
      const { fetchRecipe } = useApi();
      return fetchRecipe(target);
    },

    async saveRecipe(payload: RecipeUpdatePayload, token: string) {
      const { saveRecipe } = useApi();
      await saveRecipe(payload, token);

      // Update the affected target's count locally rather than refetching the
      // whole summary - the save already tells us exactly what changed.
      const count = payload.ingredients.length;
      if (payload.productId) {
        this.productRecipeCounts = { ...this.productRecipeCounts, [payload.productId]: count };
      } else if (payload.modifierId) {
        this.modifierRecipeCounts = { ...this.modifierRecipeCounts, [payload.modifierId]: count };
      }
    },

    async deleteRecipe(productId: string, token: string) {
      const { deleteRecipe } = useApi();
      await deleteRecipe(productId, token);

      const next = { ...this.productRecipeCounts };
      delete next[productId];
      this.productRecipeCounts = next;
    },
  },
});
