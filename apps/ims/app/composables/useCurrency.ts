const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
// Riel is a plain number with the ៛ sign appended by hand, as in the POS
// (apps/pos/src/lib/currency.ts): the km-KH currency style needs Khmer locale
// data that Chromium-based browsers (Chrome, Brave, Edge) don't all ship, and
// without it Intl shows "KHR 12,500" instead of "12,500៛".
const rielFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function useCurrency() {
  const settings = useSettingsStore();

  function formatUsd(value: number): string {
    return usdFormatter.format(value);
  }

  function formatRiel(value: number): string {
    return `${rielFormatter.format(value)}៛`;
  }

  // Riel has no sub-unit in everyday use, so amounts are rounded to the
  // nearest 100 - the smallest note in common circulation.
  function usdToRiel(usdValue: number): number {
    return Math.round((usdValue * settings.exchangeRateRielPerUsd) / 100) * 100;
  }

  function formatRielEquivalent(usdValue: number): string {
    return formatRiel(usdToRiel(usdValue));
  }

  // The store's chosen "main" currency (admin setting) is shown prominently
  // everywhere; the other currency is the smaller secondary readout. Values
  // are always stored/computed in USD regardless of this display preference.
  function formatMain(usdValue: number): string {
    return settings.mainCurrency === "KHR" ? formatRielEquivalent(usdValue) : formatUsd(usdValue);
  }

  function formatSecondary(usdValue: number): string {
    return settings.mainCurrency === "KHR" ? formatUsd(usdValue) : formatRielEquivalent(usdValue);
  }

  return { formatUsd, formatRiel, usdToRiel, formatRielEquivalent, formatMain, formatSecondary };
}
