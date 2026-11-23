import { defineStore } from "pinia";
import type { OrderDetail, OrderEditPayload, OrderSummary } from "~/types/orders";

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

    // Both replace the open order with its saved state, then reload the list
    // and mark the Analytics report stale, since totals may have changed.
    // Errors are left to the caller, which shows them in its form.
    async voidOrder(id: string, reason: string) {
      const { voidOrder, fetchOrderDetail } = useApi();
      const token = useAuth().requireToken();
      await voidOrder(id, reason, token);
      this.selectedOrder = await fetchOrderDetail(id, token);
      this.afterOrderChange(token);
    },

    async updateOrder(id: string, payload: OrderEditPayload) {
      const { updateOrder } = useApi();
      const token = useAuth().requireToken();
      this.selectedOrder = await updateOrder(id, payload, token);
      this.afterOrderChange(token);
    },

    afterOrderChange(token: string) {
      const period = useSalesPeriodStore();
      this.fetchOrders(period.startDate, period.endDate, token);
      useReportsStore().loadedRange = null;
    },

    clearSelectedOrder() {
      this.selectedOrder = null;
      this.detailError = null;
    },
  },
});
