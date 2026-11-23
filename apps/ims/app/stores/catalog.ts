import { defineStore } from "pinia";
import type {
  Category, CategoryPayload, ModifierGroup, ModifierGroupPayload, Product, ProductPayload,
} from "~/types/catalog";

// Categories are shown in their saved order (sortOrder), as the server lists them.
function sortCategories(list: Category[]): Category[] {
  return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export const useCatalogStore = defineStore("catalog", {
  state: () => ({
    categories: [] as Category[],
    products: [] as Product[],
    modifierGroups: [] as ModifierGroup[],
    isLoading: false,
    hasLoadedOnce: false,
    error: null as string | null,
  }),

  actions: {
    async fetchCatalog() {
      const { fetchCatalog } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        const { categories, products, modifierGroups } = await fetchCatalog();
        this.categories = categories;
        this.products = products;
        this.modifierGroups = modifierGroups;
        this.hasLoadedOnce = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load catalog.";
      } finally {
        this.isLoading = false;
      }
    },

    // Saves update the lists from the server's response instead of reloading
    // the whole menu (three lists) after every change.

    async createProduct(payload: ProductPayload, token: string) {
      const { createProduct } = useApi();
      this.products = [...this.products, await createProduct(payload, token)];
    },

    async updateProduct(id: string, payload: ProductPayload, token: string) {
      const { updateProduct } = useApi();
      const updated = await updateProduct(id, payload, token);
      this.products = this.products.map((product) => (product.id === id ? updated : product));
    },

    async deleteProduct(id: string, token: string) {
      const { deleteProduct } = useApi();
      await deleteProduct(id, token);
      // The server also unlinks it from modifier groups and drops its recipe.
      this.products = this.products.filter((product) => product.id !== id);
      this.modifierGroups = this.modifierGroups.map((group) => ({
        ...group,
        productIds: group.productIds.filter((productId) => productId !== id),
      }));
      useRecipeStore().forgetProduct(id);
    },

    async createCategory(payload: CategoryPayload, token: string) {
      const { createCategory } = useApi();
      this.categories = sortCategories([...this.categories, await createCategory(payload, token)]);
    },

    async updateCategory(id: string, payload: CategoryPayload, token: string) {
      const { updateCategory } = useApi();
      const updated = await updateCategory(id, payload, token);
      this.categories = sortCategories(this.categories.map((category) => (category.id === id ? updated : category)));
    },

    async reorderCategories(categoryIds: string[], token: string) {
      const { reorderCategories } = useApi();
      this.categories = await reorderCategories(categoryIds, token);
    },

    async deleteCategory(id: string, token: string, reassignToCategoryId?: string) {
      const { deleteCategory } = useApi();
      // The response carries the remaining categories, renumbered.
      const result = await deleteCategory(id, token, reassignToCategoryId);
      this.categories = result.categories;
      if (reassignToCategoryId) {
        this.products = this.products.map((product) =>
          product.categoryId === id ? { ...product, categoryId: reassignToCategoryId } : product,
        );
      }
    },

    async createModifierGroup(payload: ModifierGroupPayload, token: string) {
      const { createModifierGroup } = useApi();
      this.modifierGroups = [...this.modifierGroups, await createModifierGroup(payload, token)];
    },

    async updateModifierGroup(id: string, payload: ModifierGroupPayload, token: string) {
      const { updateModifierGroup } = useApi();
      const updated = await updateModifierGroup(id, payload, token);
      this.modifierGroups = this.modifierGroups.map((group) => (group.id === id ? updated : group));
    },

    async deleteModifierGroup(id: string, token: string) {
      const { deleteModifierGroup } = useApi();
      await deleteModifierGroup(id, token);
      const removed = this.modifierGroups.find((group) => group.id === id);
      this.modifierGroups = this.modifierGroups.filter((group) => group.id !== id);
      // Its options' recipes go with it on the server.
      for (const option of removed?.options ?? []) {
        useRecipeStore().forgetModifier(option.id);
      }
    },
  },
});
