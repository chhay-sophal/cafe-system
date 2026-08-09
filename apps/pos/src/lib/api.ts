import type { Category, Product } from "../types/catalog";
import type { ModifierGroup } from "../types/cart";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchCategories(): Promise<Category[]> {
  return getJson<Category[]>("/api/categories");
}

export function fetchProducts(): Promise<Product[]> {
  return getJson<Product[]>("/api/products");
}

export function fetchProductModifiers(productId: string): Promise<ModifierGroup[]> {
  return getJson<ModifierGroup[]>(`/api/products/${productId}/modifiers`);
}
