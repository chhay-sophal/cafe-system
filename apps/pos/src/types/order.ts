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
