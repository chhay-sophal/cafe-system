import { defineStore } from "pinia";
import type { OrderDetail, OrderSummary } from "~/types/orders";

export const useOrdersStore = defineStore("orders", {
  state: () => ({
    orders: [] as OrderSummary[],
    isLoading: false,
    hasLoadedOnce: false,
    error: null as string | null,
    selectedOrder: null as OrderDetail | null,
    isDetailLoading: false,
    detailError: null as string | null,
  }),

  actions: {
    async fetchOrders(startDate: string, endDate: string, token: string) {
      const { fetchOrders } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        this.orders = await fetchOrders(startDate, endDate, token);
        this.hasLoadedOnce = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load orders.";
      } finally {
        this.isLoading = false;
      }
    },

    async fetchOrderDetail(id: string, token: string) {
      const { fetchOrderDetail } = useApi();
      this.isDetailLoading = true;
      this.detailError = null;
      this.selectedOrder = null;

      try {
        this.selectedOrder = await fetchOrderDetail(id, token);
      } catch (error) {
        this.detailError = error instanceof Error ? error.message : "Failed to load order.";
      } finally {
        this.isDetailLoading = false;
      }
    },

    clearSelectedOrder() {
      this.selectedOrder = null;
      this.detailError = null;
    },
  },
});
