import { t } from "../i18n";
import type { AuthSession } from "../types/auth";
import type { Category, Product } from "../types/catalog";
import type { ModifierGroupWithProducts } from "../types/cart";
import type { OrderDetail, OrderListRow, OrderPayload, OrderResult } from "../types/order";
import type { StoreSettings } from "../types/settings";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
// Short by default so checkout falls back to the offline queue quickly when
// the connection drops.
const REQUEST_TIMEOUT_MS = 5000;
// Login is the first request after the app has sat idle, so it's the one that
// pays for a sleeping host (e.g. Render's free tier) waking up - which can take
// well over the default. There's no offline fallback for it to wait on anyway.
const LOGIN_TIMEOUT_MS = 60000;

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

// A 401 on a request that carried the login token means the saved session is
// no longer valid - expired, the user was deactivated/deleted, or it was
// issued by a different backend database. useAuth registers a handler that
// logs out, instead of leaving the cashier stuck with a raw error.
let unauthorizedHandler: ((token: string) => void) | null = null;

export function onUnauthorized(handler: (token: string) => void): void {
  unauthorizedHandler = handler;
}

async function throwHttpError(response: Response, token?: string): Promise<never> {
  if (token && response.status === 401) {
    unauthorizedHandler?.(token);
  }
  throw new HttpError(await parseErrorMessage(response), response.status);
}

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ?? t("common.requestFailed", { status: response.status });
}

// The server couldn't be reached at all (timed out, connection refused, DNS...).
// Deliberately not an HttpError, so callers still treat it as "offline" - this
// only replaces the browser's raw text ("signal is aborted without reason",
// "Failed to fetch") with a message a cashier can act on.
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    throw new NetworkError(timedOut ? t("common.requestTimedOut") : t("common.serverUnreachable"));
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, { headers });

  if (!response.ok) {
    await throwHttpError(response, token);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown, token?: string, timeoutMs?: number): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!response.ok) {
    await throwHttpError(response, token);
  }

  return response.json() as Promise<T>;
}

export function fetchCategories(): Promise<Category[]> {
  return getJson<Category[]>("/api/categories");
}

export function fetchProducts(): Promise<Product[]> {
  return getJson<Product[]>("/api/products");
}

// Every modifier group, each listing the products it applies to - loaded once
// with the menu instead of one request per product tap.
export function fetchModifierGroups(): Promise<ModifierGroupWithProducts[]> {
  return getJson<ModifierGroupWithProducts[]>("/api/modifiers");
}

export function login(pin: string): Promise<AuthSession> {
  return postJson<AuthSession>("/api/auth/login", { pin }, undefined, LOGIN_TIMEOUT_MS);
}

export function submitOrder(payload: OrderPayload, token: string): Promise<OrderResult> {
  return postJson<OrderResult>("/api/orders", payload, token);
}

// No date params - the backend defaults to the store's local "today".
export function fetchMyOrdersToday(token: string): Promise<OrderListRow[]> {
  return getJson<OrderListRow[]>("/api/orders?mine=true", token);
}

export function fetchOrderDetail(orderId: string, token: string): Promise<OrderDetail> {
  return getJson<OrderDetail>(`/api/orders/${encodeURIComponent(orderId)}`, token);
}

export async function voidOrder(orderId: string, reason: string, token: string): Promise<void> {
  await postJson(`/api/orders/${encodeURIComponent(orderId)}/void`, { reason }, token);
}

export function fetchExchangeRate(): Promise<StoreSettings> {
  return getJson<StoreSettings>("/api/settings/exchange-rate");
}
