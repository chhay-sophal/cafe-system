export interface Category {
  id: string;
  name: string;
  sortOrder: number | null;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  basePrice: number;
  sku: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  createdAt: string | null;
}

export interface CategoryPayload {
  name: string;
  sortOrder?: number;
}

export interface ProductPayload {
  categoryId: string;
  name: string;
  basePrice: number;
  sku?: string;
  imageUrl?: string;
  isAvailable: boolean;
}

export interface ImageUploadResult {
  url: string;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceExtra: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelection: number | null;
  maxSelection: number | null;
  options: ModifierOption[];
}
