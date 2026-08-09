export interface InventoryItem {
  id: string;
  name: string;
  stockQuantity: number;
  unit: string;
  reorderThreshold: number;
  costPerUnit: number;
  updatedAt: string | null;
  isLowStock: boolean;
}

export type AdjustmentType = "RESTOCK" | "WASTAGE" | "AUDIT_CORRECTION";

export interface StockAdjustmentPayload {
  inventoryItemId: string;
  quantityChanged: number;
  type: AdjustmentType;
  notes?: string;
}
