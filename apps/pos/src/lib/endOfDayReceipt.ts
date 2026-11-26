import { i18n } from "../i18n";
import { storeHeaderBlocks } from "../composables/useStoreDetails";
import { useStoreName } from "../composables/useStoreName";
import type { MainCurrency } from "../types/settings";
import type { EndOfDayReport } from "../types/order";
import { formatMain, formatRiel, formatSecondary, formatUsd } from "./currency";
import { formatReceiptDate, type ReceiptBlock } from "./receipt";

// The end-of-day printout: the day's sales, how they were paid, the cash
// that should be in the drawer per currency, and the items sold - laid out
// like a sale receipt, so it prints on the same roll.
export function buildEndOfDayReceipt(
  report: EndOfDayReport,
  options: { mainCurrency: MainCurrency; exchangeRateRielPerUsd: number; unsyncedCount: number },
): ReceiptBlock[] {
  const { t } = i18n.global;
  const money = (value: number) => formatMain(value, options.mainCurrency, options.exchangeRateRielPerUsd);
  const time = (value: string | null) => (value ? value.slice(11, 16) : "");
  const heading = (text: string): ReceiptBlock => ({ type: "text", text, bold: true });
  // Money taken out, signed - but "0", not "-0", when there was none.
  const minus = (text: string, value: number) => (value > 0 ? `-${text}` : text);

  const storeHeader = storeHeaderBlocks();
  const blocks: ReceiptBlock[] = [
    { type: "text", text: useStoreName().storeName.value, align: "center", size: "large", bold: true },
    ...storeHeader,
    { type: "spacer", height: 8 },
    { type: "text", text: t("endOfDay.title"), align: "center", size: "large", bold: true },
    { type: "text", text: report.date, align: "center", bold: true },
    {
      type: "text",
      text: report.cashierName ? t("receipt.cashier", { name: report.cashierName }) : t("endOfDay.allCashiers"),
      align: "center",
      size: "small",
    },
  ];
  if (report.firstSaleAt && report.lastSaleAt) {
    blocks.push({
      type: "text",
      text: t("endOfDay.salesHours", { from: time(report.firstSaleAt), to: time(report.lastSaleAt) }),
      align: "center",
      size: "small",
    });
  }
  blocks.push({ type: "text", text: t("endOfDay.printedAt", { time: formatReceiptDate(new Date()) }), align: "center", size: "small" });

  // Counts
  blocks.push(
    { type: "divider" },
    { type: "row", left: t("endOfDay.orders"), right: String(report.orders) },
    { type: "row", left: t("endOfDay.itemsSold"), right: String(report.itemsSold) },
  );
  if (report.voided.count > 0) {
    blocks.push({ type: "row", left: t("endOfDay.voided", { count: report.voided.count }), right: money(report.voided.amount) });
  }

  // Sales
  blocks.push({ type: "divider" }, { type: "row", left: t("endOfDay.grossSales"), right: money(report.sales.gross) });
  if (report.sales.discounts > 0) {
    blocks.push({ type: "row", left: t("cart.discount"), right: `-${money(report.sales.discounts)}` });
  }
  if (report.sales.tax > 0) {
    blocks.push({ type: "row", left: t("cart.tax"), right: money(report.sales.tax) });
  }
  blocks.push(
    { type: "row", left: t("endOfDay.netSales"), right: money(report.sales.net), size: "large", bold: true },
    {
      type: "row",
      left: "",
      right: formatSecondary(report.sales.net, options.mainCurrency, options.exchangeRateRielPerUsd),
      size: "small",
    },
  );

  // Payments
  if (report.payments.length > 0) {
    blocks.push({ type: "divider" }, heading(t("endOfDay.payments")));
    for (const payment of report.payments) {
      blocks.push({
        type: "row",
        left: t("endOfDay.paymentLine", { method: t(`checkout.methods.${payment.method}`), count: payment.count }),
        right: money(payment.amount),
      });
    }
  }

  // Cash drawer - per currency, as the notes physically moved.
  const cash = report.cash;
  if (cash.tenderedUsd > 0 || cash.tenderedRiel > 0) {
    blocks.push(
      { type: "divider" },
      heading(t("endOfDay.cashDrawer")),
      { type: "row", left: t("endOfDay.receivedUsd"), right: formatUsd(cash.tenderedUsd) },
      { type: "row", left: t("endOfDay.receivedRiel"), right: formatRiel(cash.tenderedRiel) },
      { type: "row", left: t("endOfDay.changeUsd"), right: minus(formatUsd(cash.changeUsd), cash.changeUsd) },
      { type: "row", left: t("endOfDay.changeRiel"), right: minus(formatRiel(cash.changeRiel), cash.changeRiel) },
      { type: "row", left: t("endOfDay.inDrawerUsd"), right: formatUsd(cash.inDrawerUsd), bold: true },
      { type: "row", left: t("endOfDay.inDrawerRiel"), right: formatRiel(cash.inDrawerRiel), bold: true },
      { type: "text", text: t("endOfDay.floatNote"), size: "small" },
    );
  }

  // Items
  if (report.items.length > 0) {
    blocks.push({ type: "divider" }, heading(t("endOfDay.items")));
    for (const item of report.items) {
      blocks.push({ type: "row", left: `${item.quantity} x ${item.name}`, right: money(item.amount) });
    }
  }

  if (report.orders === 0 && report.voided.count === 0) {
    blocks.push({ type: "divider" }, { type: "text", text: t("endOfDay.noSales"), align: "center" });
  }

  // Sales still queued on this register aren't on the server yet.
  if (options.unsyncedCount > 0) {
    blocks.push({ type: "divider" }, { type: "text", text: t("endOfDay.unsynced", { count: options.unsyncedCount }), bold: true });
  }

  // Signed when the drawer is handed over.
  blocks.push(
    { type: "spacer", height: 40 },
    { type: "text", text: t("endOfDay.signature"), size: "small" },
    { type: "spacer", height: 16 },
  );
  return blocks;
}
