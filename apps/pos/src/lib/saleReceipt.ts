import { i18n } from "../i18n";
import { storeFooterBlocks, storeHeaderBlocks } from "../composables/useStoreDetails";
import { useStoreName } from "../composables/useStoreName";
import type { MainCurrency } from "../types/settings";
import type { OrderDetail, PaymentMethod } from "../types/order";
import { formatMain, formatRiel, formatSecondary, formatUsd } from "./currency";
import type { ReceiptBlock } from "./receipt";

// A sale as it appears on the receipt - built from the checkout screen right
// after a sale, or from a saved order when Sales History prints it again.
export interface ReceiptSale {
  // "Order #12", or that the sale is still waiting to sync.
  orderLabel: string;
  // Store-local "YYYY-MM-DD HH:MM".
  soldAt: string;
  cashierName: string | null | undefined;
  // lineTotal includes the modifier extras.
  items: Array<{ quantity: number; name: string; lineTotal: number; modifiers: string[] }>;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod | null;
  // Cash sales only.
  cash: { tenderedUsd: number; tenderedRiel: number; changeUsd: number; changeRiel: number } | null;
  mainCurrency: MainCurrency;
  exchangeRateRielPerUsd: number;
  // Printed again later (Sales History) - marked as a copy.
  isCopy?: boolean;
}

export function formatChangeAmount(usd: number, riel: number): string {
  if (usd > 0 && riel > 0) {
    return `${formatUsd(usd)} + ${formatRiel(riel)}`;
  }
  return riel > 0 ? formatRiel(riel) : formatUsd(usd);
}

export function buildSaleReceipt(sale: ReceiptSale): ReceiptBlock[] {
  const { t } = i18n.global;
  const format = (value: number) => formatMain(value, sale.mainCurrency, sale.exchangeRateRielPerUsd);

  const storeHeader = storeHeaderBlocks();
  const blocks: ReceiptBlock[] = [
    { type: "text", text: useStoreName().storeName.value, align: "center", size: "large", bold: true },
    // Address, phones and emails from Settings → General, set apart from the
    // sale details below.
    ...storeHeader,
    ...(storeHeader.length > 0 ? [{ type: "spacer", height: 8 } as const] : []),
    { type: "text", text: sale.soldAt, align: "center", size: "small" },
    { type: "text", text: sale.orderLabel, align: "center", bold: true },
  ];

  if (sale.isCopy) {
    blocks.push({ type: "text", text: t("receipt.copy"), align: "center", size: "small", bold: true });
  }
  if (sale.cashierName) {
    blocks.push({ type: "text", text: t("receipt.cashier", { name: sale.cashierName }), align: "center", size: "small" });
  }

  blocks.push({ type: "divider" });

  for (const item of sale.items) {
    blocks.push({ type: "row", left: `${item.quantity} x ${item.name}`, right: format(item.lineTotal) });
    for (const modifier of item.modifiers) {
      blocks.push({ type: "text", text: `+ ${modifier}`, size: "small", indent: 24 });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "row", left: t("cart.subtotal"), right: format(sale.subtotal) });
  if (sale.taxAmount > 0) {
    blocks.push({ type: "row", left: t("cart.tax"), right: format(sale.taxAmount) });
  }
  if (sale.discountAmount > 0) {
    blocks.push({ type: "row", left: t("cart.discount"), right: `-${format(sale.discountAmount)}` });
  }
  blocks.push({ type: "row", left: t("cart.total"), right: format(sale.totalAmount), size: "large", bold: true });
  blocks.push({
    type: "row",
    left: "",
    right: formatSecondary(sale.totalAmount, sale.mainCurrency, sale.exchangeRateRielPerUsd),
    size: "small",
  });

  blocks.push({ type: "divider" });
  if (sale.paymentMethod) {
    blocks.push({ type: "row", left: t("receipt.payment"), right: t(`checkout.methods.${sale.paymentMethod}`) });
  }
  if (sale.cash) {
    if (sale.cash.tenderedUsd > 0) {
      blocks.push({ type: "row", left: t("receipt.tendered"), right: formatUsd(sale.cash.tenderedUsd) });
    }
    if (sale.cash.tenderedRiel > 0) {
      blocks.push({ type: "row", left: t("receipt.tendered"), right: formatRiel(sale.cash.tenderedRiel) });
    }
    blocks.push({
      type: "row",
      left: t("checkout.changeDueLabel"),
      right: formatChangeAmount(sale.cash.changeUsd, sale.cash.changeRiel),
      bold: true,
    });
  }

  blocks.push({ type: "spacer", height: 12 });
  blocks.push({ type: "text", text: t("receipt.thankYou"), align: "center" });
  // Social media under the thanks, where customers look for where to follow.
  blocks.push(...storeFooterBlocks());
  return blocks;
}

// A saved order (Sales History) as a receipt copy. Amounts use the rate the
// sale was rung up at, so the riel figures match the original receipt.
export function receiptSaleFromOrder(
  order: OrderDetail,
  mainCurrency: MainCurrency,
  currentRateRielPerUsd: number,
): ReceiptSale {
  const payment = order.payment;
  return {
    orderLabel: i18n.global.t("checkout.orderNumber", { number: order.orderNumber }),
    soldAt: order.createdAt.slice(0, 16),
    cashierName: order.cashierName,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      name: item.productName,
      lineTotal: (item.unitPrice + item.modifiers.reduce((sum, modifier) => sum + modifier.priceExtra, 0)) * item.quantity,
      modifiers: item.modifiers.map((modifier) => modifier.modifierName),
    })),
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    totalAmount: order.totalAmount,
    paymentMethod: payment?.paymentMethod ?? null,
    cash:
      payment?.paymentMethod === "CASH"
        ? {
          tenderedUsd: payment.amountTenderedUsd,
          tenderedRiel: payment.amountTenderedRiel,
          changeUsd: payment.changeGivenUsd,
          changeRiel: payment.changeGivenRiel,
        }
        : null,
    mainCurrency,
    exchangeRateRielPerUsd: payment?.exchangeRateRielPerUsd || currentRateRielPerUsd,
    isCopy: true,
  };
}
