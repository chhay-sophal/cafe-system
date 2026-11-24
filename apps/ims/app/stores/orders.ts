import { defineStore } from "pinia";
import type { OrderDetail, OrderEditPayload, OrderSummary } from "~/types/orders";

export const useOrdersStore = defineStore("orders", {
  state: () => ({
    orders: [] as OrderSummary[],
    // The period `orders` was loaded for, and when (see utils/cache.ts).
    loadedRange: null as string | null,
    loadedAt: null as number | null,
    // Order details already opened since the list last loaded.
    detailCache: {} as Record<string, OrderDetail>,
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
        this.loadedRange = `${startDate}..${endDate}`;
        this.loadedAt = Date.now();
        // Fresh list, fresh details - a sale may have been voided on the POS.
        this.detailCache = {};
        this.hasLoadedOnce = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load orders.";
      } finally {
        this.isLoading = false;
      }
    },

    // On opening Sales History: reuse the list unless it's for another period
    // or over a minute old - the POS keeps adding sales (utils/cache.ts).
    async ensureOrders(startDate: string, endDate: string, token: string) {
      if (this.loadedRange !== `${startDate}..${endDate}` || !isFresh(this.loadedAt, SHARED_DATA_MAX_AGE_MS)) {
        await this.fetchOrders(startDate, endDate, token);
      }
    },

    async fetchOrderDetail(id: string, token: string) {
      const cached = this.detailCache[id];
      if (cached) {
        this.selectedOrder = cached;
        this.detailError = null;
        return;
      }

      const { fetchOrderDetail } = useApi();
      this.isDetailLoading = true;
      this.detailError = null;
      this.selectedOrder = null;

      try {
        this.selectedOrder = await fetchOrderDetail(id, token);
        this.detailCache = { ...this.detailCache, [id]: this.selectedOrder };
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
      this.detailCache = { ...this.detailCache, [detail.id]: detail };
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
            products: [...new Map(detail.items.map((item) => [item.productId, { id: item.productId, name: item.productName }])).values()],
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
