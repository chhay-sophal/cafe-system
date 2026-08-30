import { emit, emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PaymentMethod } from "../types/order";

// Tauri's event bus is the cross-window channel: the cashier ("main")
// window and the customer-facing display are separate webviews with no
// shared JS state, but emit()/listen() already route through the Tauri
// core across windows with no extra plugin needed.
const CART_UPDATE_EVENT = "customer-display:cart-update";
const SALE_COMPLETED_EVENT = "customer-display:sale-completed";
const REQUEST_SYNC_EVENT = "customer-display:request-sync";

const MAIN_WINDOW_LABEL = "main";

export interface CustomerDisplayItem {
  cartItemId: string;
  productName: string;
  modifierNames: string[];
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface CartUpdatePayload {
  items: CustomerDisplayItem[];
  discountAmount: number;
  totalAmount: number;
}

export interface SaleCompletedPayload extends CartUpdatePayload {
  paymentMethod: PaymentMethod;
  amountTenderedUsd: number;
  amountTenderedRiel: number;
  changeGivenUsd: number;
  changeGivenRiel: number;
}

// Fire-and-forget: outside a real Tauri window (e.g. plain `vite dev` in a
// browser tab for quick UI iteration) there's no IPC bridge and these
// reject - swallow that rather than let it surface as an unhandled
// rejection or break cart reactivity.
function silently<T>(promise: Promise<T>): void {
  promise.catch(() => {});
}

export function publishCartUpdate(payload: CartUpdatePayload): void {
  silently(emit(CART_UPDATE_EVENT, payload));
}

export function publishSaleCompleted(payload: SaleCompletedPayload): void {
  silently(emit(SALE_COMPLETED_EVENT, payload));
}

export function requestSync(): void {
  silently(emitTo(MAIN_WINDOW_LABEL, REQUEST_SYNC_EVENT));
}

export function onCartUpdate(handler: (payload: CartUpdatePayload) => void): Promise<UnlistenFn> {
  return listen<CartUpdatePayload>(CART_UPDATE_EVENT, (event) => handler(event.payload));
}

export function onSaleCompleted(handler: (payload: SaleCompletedPayload) => void): Promise<UnlistenFn> {
  return listen<SaleCompletedPayload>(SALE_COMPLETED_EVENT, (event) => handler(event.payload));
}

export function onRequestSync(handler: () => void): Promise<UnlistenFn> {
  return listen(REQUEST_SYNC_EVENT, () => handler());
}
