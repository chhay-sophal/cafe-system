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

export interface CartModifier {
  id: string;
  name: string;
  priceExtra: number;
}

export interface CartLineItem {
  cartItemId: string;
  productId: string;
  productName: string;
  unitBasePrice: number;
  modifiers: CartModifier[];
  quantity: number;
}
