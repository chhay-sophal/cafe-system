import type { AuthSession } from "~/types/auth";
import type { Category, ModifierGroup, Product } from "~/types/catalog";
import type { InventoryItem, StockAdjustmentPayload } from "~/types/inventory";
import type { RecipeIngredientRecord, RecipeTarget, RecipeUpdatePayload } from "~/types/recipe";
import type { DailySummaryReport } from "~/types/reports";

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

  async function sendJson<T>(method: "POST" | "PUT", path: string, body: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
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
    return sendJson<AuthSession>("POST", "/api/auth/login", { pin });
  }

  function adjustInventory(payload: StockAdjustmentPayload, token: string): Promise<{ success: boolean }> {
    return sendJson<{ success: boolean }>("POST", "/api/inventory/adjust", payload, token);
  }

  function fetchCategories(): Promise<Category[]> {
    return getJson<Category[]>("/api/categories");
  }

  function fetchProducts(): Promise<Product[]> {
    return getJson<Product[]>("/api/products");
  }

  function fetchModifiers(): Promise<ModifierGroup[]> {
    return getJson<ModifierGroup[]>("/api/modifiers");
  }

  function fetchRecipe(target: RecipeTarget): Promise<RecipeIngredientRecord[]> {
    const query = target.kind === "product" ? `productId=${target.id}` : `modifierId=${target.id}`;
    return getJson<RecipeIngredientRecord[]>(`/api/recipes?${query}`);
  }

  function saveRecipe(payload: RecipeUpdatePayload, token: string): Promise<{ success: boolean }> {
    return sendJson<{ success: boolean }>("PUT", "/api/recipes", payload, token);
  }

  function fetchDailySummary(startDate: string, endDate: string): Promise<DailySummaryReport> {
    return getJson<DailySummaryReport>(`/api/reports/daily-summary?startDate=${startDate}&endDate=${endDate}`);
  }

  return {
    fetchInventory,
    login,
    adjustInventory,
    fetchCategories,
    fetchProducts,
    fetchModifiers,
    fetchRecipe,
    saveRecipe,
    fetchDailySummary,
  };
}
