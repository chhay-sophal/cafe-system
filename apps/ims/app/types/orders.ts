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
  // What was sold, one entry per distinct product - the name as rung up.
  // Missing from backends older than the item filter.
  products?: Array<{ id: string; name: string }>;
  // Corrected in IMS since it was rung up (see OrderDetail.edited*).
  isEdited: boolean;
}

export interface OrderDetailItemModifier {
  modifierId: string;
  modifierName: string;
  priceExtra: number;
}

export interface OrderDetailItem {
  id: string;
  productId: string;
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
  // Set when Bakong confirmed a Mobile Pay KHQR for this sale (its md5).
  khqrMd5?: string | null;
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
  // Store-local "YYYY-MM-DD HH:MM:SS" times; null until voided / edited.
  voidReason: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  editReason: string | null;
  editedAt: string | null;
  editedByName: string | null;
}

// PUT /api/orders/:id - the whole corrected order, and why.
export interface OrderEditPayload {
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    selectedModifiers: Array<{ id: string; name: string; priceExtra: number }>;
  }>;
  paymentMethod: PaymentMethod;
  discountAmount: number;
  reason: string;
}
