import { defineStore } from "pinia";
import type { ModifierGroup } from "~/types/catalog";
import type { RecipeIngredientRecord, RecipeTarget, RecipeUpdatePayload } from "~/types/recipe";

export const useRecipeStore = defineStore("recipes", {
  state: () => ({
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
      // Categories/products live in useCatalogStore - it's the single source
      // of truth shared with the Menu tab, so a product created/edited/deleted
      // there is reflected here immediately via the same reactive state,
      // with no separate copy to go stale until a refresh.
      const catalogStore = useCatalogStore();
      const { fetchModifiers, fetchRecipeSummary } = useApi();

      this.isLoadingCatalog = true;
      this.catalogError = null;

      try {
        const [modifierGroups, summary] = await Promise.all([
          fetchModifiers(),
          fetchRecipeSummary(),
          catalogStore.hasLoadedOnce ? Promise.resolve(undefined) : catalogStore.fetchCatalog(),
        ] as const);

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
