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
      // The detail is fetched for who voided it and when; the list row is
      // patched from it rather than reloading the whole list.
      this.selectedOrder = await fetchOrderDetail(id, token);
      this.afterOrderChange(this.selectedOrder);
    },

    async updateOrder(id: string, payload: OrderEditPayload) {
      const { updateOrder } = useApi();
      this.selectedOrder = await updateOrder(id, payload, useAuth().requireToken());
      this.afterOrderChange(this.selectedOrder);
    },

    // The order's list row brought in line with its saved detail, and the
    // Analytics report marked stale, since totals may have changed.
    afterOrderChange(detail: OrderDetail) {
      this.orders = this.orders.map((row) =>
        row.id === detail.id
          ? {
            ...row,
            status: detail.status,
            subtotal: detail.subtotal,
            taxAmount: detail.taxAmount,
            discountAmount: detail.discountAmount,
            totalAmount: detail.totalAmount,
            paymentMethod: detail.payment?.paymentMethod ?? row.paymentMethod,
            itemCount: detail.items.length,
            isEdited: detail.editedAt !== null,
          }
          : row,
      );
      useReportsStore().loadedRange = null;
    },

    clearSelectedOrder() {
      this.selectedOrder = null;
      this.detailError = null;
    },
  },
});
