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
        this.items = await fetchInventory(useAuth().requireToken());
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load inventory.";
      } finally {
        this.isLoading = false;
      }
    },

    // Saves update the list from the server's response - its authoritative
    // stock and low-stock state - instead of reloading the whole inventory.

    async adjustStock(payload: StockAdjustmentPayload, token: string) {
      const { adjustInventory } = useApi();
      const { item } = await adjustInventory(payload, token);
      if (item) {
        this.replaceItem(item);
      } else {
        await this.fetchInventory();
      }
    },

    async createItem(payload: InventoryItemPayload, token: string) {
      const { createInventoryItem } = useApi();
      this.items = [...this.items, await createInventoryItem(payload, token)];
    },

    async updateItem(id: string, payload: InventoryItemPayload, token: string) {
      const { updateInventoryItem } = useApi();
      this.replaceItem(await updateInventoryItem(id, payload, token));
    },

    async deleteItem(id: string, token: string) {
      const { deleteInventoryItem } = useApi();
      await deleteInventoryItem(id, token);
      this.items = this.items.filter((item) => item.id !== id);
    },

    replaceItem(updated: InventoryItem) {
      this.items = this.items.map((item) => (item.id === updated.id ? updated : item));
    },
  },
});
