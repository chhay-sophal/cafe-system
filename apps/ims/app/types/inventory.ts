export interface InventoryItem {
  id: string;
  name: string;
  stockQuantity: number;
  unit: string;
  reorderThreshold: number;
  costPerUnit: number;
  isActive: boolean;
  updatedAt: string | null;
  isLowStock: boolean;
}

export interface InventoryItemPayload {
  name: string;
  unit: string;
  reorderThreshold: number;
  costPerUnit: number;
  isActive: boolean;
}

export type AdjustmentType = "RESTOCK" | "WASTAGE" | "AUDIT_CORRECTION";

export interface StockAdjustmentPayload {
  inventoryItemId: string;
  quantityChanged: number;
  type: AdjustmentType;
  notes?: string;
}
