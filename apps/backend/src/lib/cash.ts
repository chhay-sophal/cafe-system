// Cash tender and change rules for sales, shared by the order endpoint and
// the db:mock-orders dev script so mock sales follow the same rules.

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Riel has no sub-unit in everyday use, so amounts are rounded to the
// nearest 100 - the smallest note in common circulation.
export function usdToRiel(usdValue: number, exchangeRate: number): number {
  return Math.round((usdValue * exchangeRate) / 100) * 100;
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
// practical, and simplifies the mixed-tender case to a single currency.
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

// Cash covers the total if it does to the cent - or, when any Riel was
// tendered, if it reaches the total as shown in Riel (rounded to the nearest
// 100៛). Otherwise paying exactly the displayed Riel total could be rejected:
// $1.01 at 4,100 shows as 4,100៛, which is only $1.00. Pure-USD tender gets no
// such allowance - there the cents are real.
// Mirrored in apps/pos/src/lib/currency.ts for the checkout screen.
export function isTenderSufficient(
  totalUsd: number,
  exchangeRate: number,
  amountTenderedUsd: number,
  amountTenderedRiel: number,
): boolean {
  if (round2(amountTenderedUsd + amountTenderedRiel / exchangeRate) >= round2(totalUsd)) {
    return true;
  }
  return (
    amountTenderedRiel > 0
    && Math.round(amountTenderedUsd * exchangeRate) + amountTenderedRiel >= usdToRiel(totalUsd, exchangeRate)
  );
}
