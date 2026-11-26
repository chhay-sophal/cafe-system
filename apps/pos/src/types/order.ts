import type { CartModifier } from "./cart";

export type PaymentMethod = "CASH" | "CARD" | "QR_CODE";

export interface OrderItemPayload {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  selectedModifiers?: CartModifier[];
}

export interface OrderPayload {
  // Generated once per sale and resent unchanged on every retry, so the
  // backend can tell a resend of a sale it already recorded from a new one.
  clientOrderId: string;
  // Set only on a sale queued offline: when it was rung up and the exchange
  // rate it was charged at, so the backend records it as it happened rather
  // than as of whenever it syncs.
  soldAt?: string;
  exchangeRateRielPerUsd?: number;
  items: OrderItemPayload[];
  paymentMethod: PaymentMethod;
  amountTenderedUsd?: number;
  amountTenderedRiel?: number;
  taxAmount?: number;
  discountAmount?: number;
  // The KHQR's md5 when a Mobile Pay sale was paid through Bakong.
  khqrMd5?: string;
}

export interface OrderResult {
  success: boolean;
  orderId: string;
  orderNumber: number;
  subtotal: number;
  totalAmount: number;
  changeGivenUsd: number;
  changeGivenRiel: number;
  exchangeRateRielPerUsd: number;
}

export type OrderStatus = "COMPLETED" | "VOIDED" | "REFUNDED";

// One row of GET /api/orders - createdAt is already store-local time,
// formatted "YYYY-MM-DD HH:MM:SS".
export interface OrderListRow {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  cashierName: string | null;
  paymentMethod: PaymentMethod | null;
  itemCount: number;
  // What was sold, one entry per distinct product - the name as rung up.
  // Missing from older backends.
  products?: Array<{ id: string; name: string }>;
}

// GET /api/orders/:id. Item unitPrice/totalPrice exclude modifier extras -
// those are listed per modifier.
export interface OrderDetailItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: Array<{ modifierName: string; priceExtra: number }>;
}

export interface OrderDetailPayment {
  paymentMethod: PaymentMethod;
  amountTenderedUsd: number;
  amountTenderedRiel: number;
  changeGivenUsd: number;
  changeGivenRiel: number;
  exchangeRateRielPerUsd: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  cashierName: string | null;
  voidReason: string | null;
  items: OrderDetailItem[];
  payment: OrderDetailPayment | null;
}

// GET /api/reports/end-of-day - one day's sales for this cashier ("mine") or
// the whole store ("all"). Amounts in USD except the riel cash figures.
export interface EndOfDayReport {
  date: string;
  scope: "mine" | "all";
  cashierName: string | null;
  // Store-local "YYYY-MM-DD HH:MM:SS", null with no sales.
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  orders: number;
  itemsSold: number;
  voided: { count: number; amount: number };
  sales: { gross: number; discounts: number; tax: number; net: number };
  payments: Array<{ method: PaymentMethod; count: number; amount: number }>;
  // Cash as it physically moved, per currency; inDrawer = tendered - change.
  cash: {
    tenderedUsd: number;
    tenderedRiel: number;
    changeUsd: number;
    changeRiel: number;
    inDrawerUsd: number;
    inDrawerRiel: number;
  };
  items: Array<{ name: string; quantity: number; amount: number }>;
}
