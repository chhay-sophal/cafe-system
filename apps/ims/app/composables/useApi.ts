import type { AuthSession } from "~/types/auth";
import type {
  Category, CategoryPayload, ImageUploadResult, ModifierGroup, Product, ProductPayload,
} from "~/types/catalog";
import type { InventoryItem, InventoryItemPayload, StockAdjustmentPayload } from "~/types/inventory";
import type { OrderDetail, OrderSummary } from "~/types/orders";
import type { RecipeIngredientRecord, RecipeSummary, RecipeTarget, RecipeUpdatePayload } from "~/types/recipe";
import type { DailySummaryReport } from "~/types/reports";
import type { ExchangeRateSetting, MainCurrencySetting, StoreSettings } from "~/types/settings";
import type { StaffUser, UserCreatePayload, UserUpdatePayload } from "~/types/user";

export class HttpError extends Error {
  status: number;
  // The parsed JSON error body, when the server sent one - lets callers read
  // structured fields beyond the plain message (e.g. category deletion's
  // `productCount`) without a parallel error-handling path.
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

async function parseError(response: Response, t: (key: string, params: Record<string, unknown>) => string): Promise<{ message: string; body: unknown }> {
  const body = await response.json().catch(() => null);
  const message = body?.error ?? t("common.requestFailed", { status: response.status });
  return { message, body };
}

export function useApi() {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBase;
  // useApi() itself runs inside store actions and other callbacks invoked
  // well after setup, where useI18n()'s inject() call would throw - the
  // global composer on the Nuxt app has no such restriction.
  const { t } = useNuxtApp().$i18n;

  async function getJson<T>(path: string, token?: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, { headers });

    if (!response.ok) {
      const { message, body } = await parseError(response, t);
      throw new HttpError(message, response.status, body);
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
      const { message, body } = await parseError(response, t);
      throw new HttpError(message, response.status, body);
    }

    return response.json() as Promise<T>;
  }

  async function deleteJson<T>(path: string, token: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const { message, body } = await parseError(response, t);
      throw new HttpError(message, response.status, body);
    }

    return response.json() as Promise<T>;
  }

  async function postForm<T>(path: string, formData: FormData, token: string): Promise<T> {
    // No Content-Type header here - the browser sets multipart/form-data
    // with the correct boundary itself; setting it manually breaks parsing.
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const { message, body } = await parseError(response, t);
      throw new HttpError(message, response.status, body);
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

  function createInventoryItem(payload: InventoryItemPayload, token: string): Promise<InventoryItem> {
    return sendJson<InventoryItem>("POST", "/api/inventory", payload, token);
  }

  function updateInventoryItem(id: string, payload: InventoryItemPayload, token: string): Promise<InventoryItem> {
    return sendJson<InventoryItem>("PUT", `/api/inventory/${id}`, payload, token);
  }

  function deleteInventoryItem(id: string, token: string): Promise<{ success: boolean }> {
    return deleteJson<{ success: boolean }>(`/api/inventory/${id}`, token);
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

  function createCategory(payload: CategoryPayload, token: string): Promise<Category> {
    return sendJson<Category>("POST", "/api/categories", payload, token);
  }

  function updateCategory(id: string, payload: CategoryPayload, token: string): Promise<Category> {
    return sendJson<Category>("PUT", `/api/categories/${id}`, payload, token);
  }

  function deleteCategory(id: string, token: string, reassignToCategoryId?: string): Promise<{ success: boolean; reassignedCount: number }> {
    const query = reassignToCategoryId ? `?reassignToCategoryId=${reassignToCategoryId}` : "";
    return deleteJson<{ success: boolean; reassignedCount: number }>(`/api/categories/${id}${query}`, token);
  }

  function createProduct(payload: ProductPayload, token: string): Promise<Product> {
    return sendJson<Product>("POST", "/api/products", payload, token);
  }

  function updateProduct(id: string, payload: ProductPayload, token: string): Promise<Product> {
    return sendJson<Product>("PUT", `/api/products/${id}`, payload, token);
  }

  function deleteProduct(id: string, token: string): Promise<{ success: boolean }> {
    return deleteJson<{ success: boolean }>(`/api/products/${id}`, token);
  }

  function uploadProductImage(file: File, token: string): Promise<ImageUploadResult> {
    const formData = new FormData();
    formData.append("image", file);
    return postForm<ImageUploadResult>("/api/upload", formData, token);
  }

  function fetchRecipe(target: RecipeTarget): Promise<RecipeIngredientRecord[]> {
    const query = target.kind === "product" ? `productId=${target.id}` : `modifierId=${target.id}`;
    return getJson<RecipeIngredientRecord[]>(`/api/recipes?${query}`);
  }

  function saveRecipe(payload: RecipeUpdatePayload, token: string): Promise<{ success: boolean }> {
    return sendJson<{ success: boolean }>("PUT", "/api/recipes", payload, token);
  }

  function fetchRecipeSummary(): Promise<RecipeSummary> {
    return getJson<RecipeSummary>("/api/recipes/summary");
  }

  function deleteRecipe(productId: string, token: string): Promise<{ success: boolean }> {
    return deleteJson<{ success: boolean }>(`/api/recipes/${productId}`, token);
  }

  function fetchDailySummary(startDate: string, endDate: string): Promise<DailySummaryReport> {
    return getJson<DailySummaryReport>(`/api/reports/daily-summary?startDate=${startDate}&endDate=${endDate}`);
  }

  function fetchOrders(startDate: string, endDate: string, token: string): Promise<OrderSummary[]> {
    return getJson<OrderSummary[]>(`/api/orders?startDate=${startDate}&endDate=${endDate}`, token);
  }

  function fetchOrderDetail(id: string, token: string): Promise<OrderDetail> {
    return getJson<OrderDetail>(`/api/orders/${id}`, token);
  }

  function fetchUsers(token: string): Promise<StaffUser[]> {
    return getJson<StaffUser[]>("/api/users", token);
  }

  function createUser(payload: UserCreatePayload, token: string): Promise<StaffUser> {
    return sendJson<StaffUser>("POST", "/api/users", payload, token);
  }

  function updateUser(id: string, payload: UserUpdatePayload, token: string): Promise<StaffUser> {
    return sendJson<StaffUser>("PUT", `/api/users/${id}`, payload, token);
  }

  function fetchExchangeRate(): Promise<StoreSettings> {
    return getJson<StoreSettings>("/api/settings/exchange-rate");
  }

  function updateExchangeRate(payload: ExchangeRateSetting, token: string): Promise<ExchangeRateSetting> {
    return sendJson<ExchangeRateSetting>("PUT", "/api/settings/exchange-rate", payload, token);
  }

  function updateMainCurrency(payload: MainCurrencySetting, token: string): Promise<MainCurrencySetting> {
    return sendJson<MainCurrencySetting>("PUT", "/api/settings/main-currency", payload, token);
  }

  return {
    fetchInventory,
    login,
    adjustInventory,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    fetchCategories,
    fetchProducts,
    fetchModifiers,
    fetchRecipe,
    saveRecipe,
    fetchRecipeSummary,
    deleteRecipe,
    fetchDailySummary,
    fetchOrders,
    fetchOrderDetail,
    fetchUsers,
    createUser,
    updateUser,
    createCategory,
    updateCategory,
    deleteCategory,
    createProduct,
    updateProduct,
    deleteProduct,
    uploadProductImage,
    fetchExchangeRate,
    updateExchangeRate,
    updateMainCurrency,
  };
}
