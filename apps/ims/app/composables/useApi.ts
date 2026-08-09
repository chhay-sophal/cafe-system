import type { AuthSession } from "~/types/auth";
import type { InventoryItem, StockAdjustmentPayload } from "~/types/inventory";

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
  return body?.error ?? `Request failed with status ${response.status}`;
}

export function useApi() {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBase;

  async function getJson<T>(path: string, token?: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, { headers });

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

    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new HttpError(await parseErrorMessage(response), response.status);
    }

    return response.json() as Promise<T>;
  }

  function fetchInventory(): Promise<InventoryItem[]> {
    return getJson<InventoryItem[]>("/api/inventory");
  }

  function login(pin: string): Promise<AuthSession> {
    return postJson<AuthSession>("/api/auth/login", { pin });
  }

  function adjustInventory(payload: StockAdjustmentPayload, token: string): Promise<{ success: boolean }> {
    return postJson<{ success: boolean }>("/api/inventory/adjust", payload, token);
  }

  return { fetchInventory, login, adjustInventory };
}
