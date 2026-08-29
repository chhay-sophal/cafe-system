import type { MainCurrency } from "../types/settings";

export const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const rielFormatter = new Intl.NumberFormat("km-KH", { style: "currency", currency: "KHR", maximumFractionDigits: 0 });

export function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

export function formatRiel(value: number): string {
  return rielFormatter.format(value);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Riel has no sub-unit in everyday use, so amounts are rounded to the
// nearest 100 - the smallest note in common circulation.
export function usdToRiel(usdValue: number, exchangeRate: number): number {
  return Math.round((usdValue * exchangeRate) / 100) * 100;
}

// The store's chosen "main" currency (admin setting) is shown prominently
// everywhere; the other currency is the smaller secondary readout. Values
// are always computed in USD regardless of this display preference.
export function formatMain(usdValue: number, mainCurrency: MainCurrency, exchangeRate: number): string {
  return mainCurrency === "KHR" ? formatRiel(usdToRiel(usdValue, exchangeRate)) : formatUsd(usdValue);
}

export function formatSecondary(usdValue: number, mainCurrency: MainCurrency, exchangeRate: number): string {
  return mainCurrency === "KHR" ? formatUsd(usdValue) : formatRiel(usdToRiel(usdValue, exchangeRate));
}

// Splits a USD change amount into whole dollars (returned as USD notes) plus
// the sub-dollar remainder converted to Riel - used only when the customer
// paid in pure USD (see computeChange).
export function splitChange(changeDueUsd: number, exchangeRate: number): { usd: number; riel: number } {
  const wholeUsd = Math.floor(changeDueUsd);
  const remainderUsd = round2(changeDueUsd - wholeUsd);
  return { usd: wholeUsd, riel: usdToRiel(remainderUsd, exchangeRate) };
}

// Change currency follows how the customer paid: pure USD tender gets change
// as whole USD notes plus a Riel remainder (the standard Cambodian cashier
// split); paying in pure Riel, or a mix of both, gets change entirely in
// Riel - handing back a few cents of USD on top of Riel change isn't
// practical, and simplifies the mixed-tender case to a single currency. Same
// rule the backend applies authoritatively once an order is confirmed
// online, kept here so the checkout screen's optimistic/offline display
// can't drift from it.
export function computeChange(
  changeDueUsd: number,
  exchangeRate: number,
  amountTenderedUsd: number,
  amountTenderedRiel: number,
): { usd: number; riel: number } {
  const isPureUsdTender = amountTenderedUsd > 0 && amountTenderedRiel === 0;
  if (isPureUsdTender) {
    return splitChange(changeDueUsd, exchangeRate);
  }
  return { usd: 0, riel: usdToRiel(changeDueUsd, exchangeRate) };
}
