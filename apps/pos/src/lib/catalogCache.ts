import type { Category, Product } from "../types/catalog";
import type { ModifierGroupWithProducts } from "../types/cart";

// The last menu loaded from the backend, so the register opens straight onto
// it - and can still sell from it if it starts while the backend is down.
const STORAGE_KEY = "pos.catalog";

export interface Catalog {
  categories: Category[];
  products: Product[];
  modifierGroups: ModifierGroupWithProducts[];
}

export function loadCachedCatalog(): Catalog | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const isCatalog = parsed
      && Array.isArray(parsed.categories)
      && Array.isArray(parsed.products)
      && Array.isArray(parsed.modifierGroups);
    return isCatalog ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedCatalog(catalog: Catalog): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
  } catch {
    // Storage full (KHQR images share it) - this session still has the menu
    // in memory; only the next offline start goes without it.
  }
}
