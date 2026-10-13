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
  items: OrderItemPayload[];
  paymentMethod: PaymentMethod;
  amountTenderedUsd?: number;
  amountTenderedRiel?: number;
  taxAmount?: number;
  discountAmount?: number;
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
  items: OrderDetailItem[];
  payment: OrderDetailPayment | null;
}
