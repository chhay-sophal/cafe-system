// How long the IMS reuses data it has already loaded, shared by every page
// that shows it (Pinia stores hold one copy each):
//   - data only the IMS changes - staff, exchange rate/currency/tax, the menu,
//     inventory, recipes - is loaded once per session; the IMS's own saves
//     update that copy in place.
//   - data the POS also changes - sales (Sales History, Analytics, order
//     details) and POS settings - is reused for SHARED_DATA_MAX_AGE_MS, then
//     reloaded the next time a page needs it. Sales History also has Refresh.
export const SHARED_DATA_MAX_AGE_MS = 60_000;

// Whether data loaded at `loadedAt` (Date.now(), null = never) can still be
// used.
export function isFresh(loadedAt: number | null, maxAgeMs = Number.POSITIVE_INFINITY): boolean {
  return loadedAt !== null && Date.now() - loadedAt < maxAgeMs;
}
