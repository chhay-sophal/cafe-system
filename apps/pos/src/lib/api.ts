import { t } from "../i18n";
import type { AuthSession } from "../types/auth";
import type { Category, Product } from "../types/catalog";
import type { ModifierGroup } from "../types/cart";
import type { OrderPayload, OrderResult } from "../types/order";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 5000;

// Thrown only when the server actually responded with a non-2xx status - as
// opposed to the fetch itself failing (unreachable host, timeout, DNS, etc.),
// which surfaces as a plain/Abort error. Callers use this distinction to tell
// "the server rejected the request" apart from "we couldn't reach the server"
// (the latter being the trigger for offline queueing).
export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ?? t("common.requestFailed", { status: response.status });
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {});

  if (!response.ok) {
    throw new HttpError(await parseErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new HttpError(await parseErrorMessage(response), response.status);
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
