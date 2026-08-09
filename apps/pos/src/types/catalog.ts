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
