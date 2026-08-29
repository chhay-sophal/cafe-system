export type PaymentMethod = "CASH" | "CARD" | "QR_CODE";

export interface OrderSummary {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: "COMPLETED" | "VOIDED" | "REFUNDED";
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  cashierName: string | null;
  paymentMethod: PaymentMethod | null;
  itemCount: number;
}

export interface OrderDetailItemModifier {
  modifierName: string;
  priceExtra: number;
}

export interface OrderDetailItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: OrderDetailItemModifier[];
}

export interface OrderPaymentDetail {
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
  status: "COMPLETED" | "VOIDED" | "REFUNDED";
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  cashierName: string | null;
  items: OrderDetailItem[];
  payment: OrderPaymentDetail | null;
}
