export interface RecipeIngredientRecord {
  id: string;
  inventoryItemId: string;
  quantityRequired: number;
  inventoryItemName: string;
  inventoryItemUnit: string;
}

// A row in the editor: no `id` until it's been saved and re-fetched from the
// server, and `quantityRequired` starts empty so the input isn't pre-filled
// with a misleading 0.
export interface RecipeIngredientDraft {
  rowKey: string;
  inventoryItemId: string;
  quantityRequired: number | null;
}

export type RecipeTargetKind = "product" | "modifier";

export interface RecipeTarget {
  kind: RecipeTargetKind;
  id: string;
}

export interface RecipeUpdatePayload {
  productId?: string;
  modifierId?: string;
  ingredients: Array<{ inventoryItemId: string; quantityRequired: number }>;
}
