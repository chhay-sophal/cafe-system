import type { AuthSession } from "../types/auth";
import type { Category, Product } from "../types/catalog";
import type { ModifierGroup } from "../types/cart";
import type { OrderPayload, OrderResult } from "../types/order";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ?? `Request failed with status ${response.status}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
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

export function login(pin: string): Promise<AuthSession> {
  return postJson<AuthSession>("/api/auth/login", { pin });
}

export function submitOrder(payload: OrderPayload, token: string): Promise<OrderResult> {
  return postJson<OrderResult>("/api/orders", payload, token);
}
