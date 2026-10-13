import { defineStore } from "pinia";
import type {
  Category, CategoryPayload, ModifierGroup, ModifierGroupPayload, Product, ProductPayload,
} from "~/types/catalog";

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
      const { fetchCategories, fetchModifiers, fetchProducts } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        const [categories, products, modifierGroups] = await Promise.all([fetchCategories(), fetchProducts(), fetchModifiers()]);
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

    async createProduct(payload: ProductPayload, token: string) {
      const { createProduct } = useApi();
      await createProduct(payload, token);
      await this.fetchCatalog();
    },

    async updateProduct(id: string, payload: ProductPayload, token: string) {
      const { updateProduct } = useApi();
      await updateProduct(id, payload, token);
      await this.fetchCatalog();
    },

    async deleteProduct(id: string, token: string) {
      const { deleteProduct } = useApi();
      await deleteProduct(id, token);
      await this.fetchCatalog();
    },

    async createCategory(payload: CategoryPayload, token: string) {
      const { createCategory } = useApi();
      await createCategory(payload, token);
      await this.fetchCatalog();
    },

    async updateCategory(id: string, payload: CategoryPayload, token: string) {
      const { updateCategory } = useApi();
      await updateCategory(id, payload, token);
      await this.fetchCatalog();
    },

    async deleteCategory(id: string, token: string, reassignToCategoryId?: string) {
      const { deleteCategory } = useApi();
      await deleteCategory(id, token, reassignToCategoryId);
      // Deletion also recalculates every remaining category's sortOrder
      // server-side, so a full refetch is needed, not just removing the id.
      await this.fetchCatalog();
    },

    async createModifierGroup(payload: ModifierGroupPayload, token: string) {
      const { createModifierGroup } = useApi();
      await createModifierGroup(payload, token);
      await this.fetchCatalog();
    },

    async updateModifierGroup(id: string, payload: ModifierGroupPayload, token: string) {
      const { updateModifierGroup } = useApi();
      await updateModifierGroup(id, payload, token);
      await this.fetchCatalog();
    },

    async deleteModifierGroup(id: string, token: string) {
      const { deleteModifierGroup } = useApi();
      await deleteModifierGroup(id, token);
      await this.fetchCatalog();
    },
  },
});
