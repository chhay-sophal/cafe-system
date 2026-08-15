import { defineStore } from "pinia";
import type { Category, CategoryPayload, Product, ProductPayload } from "~/types/catalog";

export const useCatalogStore = defineStore("catalog", {
  state: () => ({
    categories: [] as Category[],
    products: [] as Product[],
    isLoading: false,
    hasLoadedOnce: false,
    error: null as string | null,
  }),

  actions: {
    async fetchCatalog() {
      const { fetchCategories, fetchProducts } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        const [categories, products] = await Promise.all([fetchCategories(), fetchProducts()]);
        this.categories = categories;
        this.products = products;
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
  },
});
