import { ref } from "vue";
import { fetchMyOrdersToday, fetchOrderDetail } from "../lib/api";
import type { OrderDetail, OrderListRow } from "../types/order";

// Sales History lists only the logged-in cashier's own sales for today, and
// nothing outside this register changes them (sales are rung up and voided
// here; IMS can't void). So the list and opened invoices are kept in memory
// across tab switches and only fetched again when:
//   - this register completed or synced a sale since (invalidate()),
//   - the cashier (session) or the day changed, or
//   - the cashier pressed Refresh (e.g. they also sold on another register).
// Voids are applied locally (markVoided) instead of refetching.
const orders = ref<OrderListRow[]>([]);
let loadedForToken: string | null = null;
let loadedForDay: string | null = null;
let isStale = true;
const orderDetails = new Map<string, OrderDetail>();

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function needsReload(token: string): boolean {
  return isStale || loadedForToken !== token || loadedForDay !== today();
}

async function loadOrders(token: string, { force = false } = {}): Promise<void> {
  if (!force && !needsReload(token)) {
    return;
  }
  if (loadedForToken !== token) {
    // A different cashier - don't show the previous one's sales meanwhile.
    orders.value = [];
    orderDetails.clear();
  }
  const day = today();
  orders.value = await fetchMyOrdersToday(token);
  loadedForToken = token;
  loadedForDay = day;
  isStale = false;
}

async function loadOrderDetail(orderId: string, token: string): Promise<OrderDetail> {
  const cached = orderDetails.get(orderId);
  if (cached) {
    return cached;
  }
  const detail = await fetchOrderDetail(orderId, token);
  orderDetails.set(orderId, detail);
  return detail;
}

// A void only changes the status (and adds the reason), so patch the cached
// row and invoice instead of fetching either again.
function markVoided(orderId: string, reason: string): void {
  orders.value = orders.value.map((order) => (order.id === orderId ? { ...order, status: "VOIDED" } : order));
  const detail = orderDetails.get(orderId);
  if (detail) {
    orderDetails.set(orderId, { ...detail, status: "VOIDED", voidReason: reason });
  }
}

// Called when this register records a sale with the backend (online checkout
// or an offline sale syncing), so the next visit to the tab picks it up.
function invalidate(): void {
  isStale = true;
}

export function useSalesHistory() {
  return { orders, needsReload, loadOrders, loadOrderDetail, markVoided, invalidate };
}
