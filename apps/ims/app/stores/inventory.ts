import { defineStore } from "pinia";
import type { InventoryItem, InventoryItemPayload, StockAdjustmentPayload } from "~/types/inventory";

export const useInventoryStore = defineStore("inventory", {
  state: () => ({
    items: [] as InventoryItem[],
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    units: (state): string[] => Array.from(new Set(state.items.map((item) => item.unit))).sort(),
    lowStockCount: (state): number => state.items.filter((item) => item.isLowStock).length,
  },

  actions: {
    async fetchInventory() {
      const { fetchInventory } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        this.items = await fetchInventory();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load inventory.";
      } finally {
        this.isLoading = false;
      }
    },

    async adjustStock(payload: StockAdjustmentPayload, token: string) {
      const { adjustInventory } = useApi();
      await adjustInventory(payload, token);
      // Re-fetch rather than mutate locally so the table reflects the
      // server's authoritative stock/low-stock state, not a client guess.
      await this.fetchInventory();
    },

    async createItem(payload: InventoryItemPayload, token: string) {
      const { createInventoryItem } = useApi();
      await createInventoryItem(payload, token);
      await this.fetchInventory();
    },

    async updateItem(id: string, payload: InventoryItemPayload, token: string) {
      const { updateInventoryItem } = useApi();
      await updateInventoryItem(id, payload, token);
      await this.fetchInventory();
    },

    async deleteItem(id: string, token: string) {
      const { deleteInventoryItem } = useApi();
      await deleteInventoryItem(id, token);
      await this.fetchInventory();
    },
  },
});
