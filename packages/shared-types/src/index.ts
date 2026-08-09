import { z } from 'zod';

export const pinLoginSchema = z.object({
  pin: z.string().trim().min(1, 'PIN is required'),
});

export const managerApprovalSchema = z.object({
  action: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).optional(),
});

export const orderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    productName: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    selectedModifiers: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      priceExtra: z.number().nonnegative(),
    })).optional(),
  })).min(1),
  paymentMethod: z.enum(['CASH', 'CARD', 'QR_CODE']),
  amountTendered: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
});

export const inventoryAdjustmentSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantityChanged: z.number(),
  type: z.enum(['RESTOCK', 'WASTAGE', 'AUDIT_CORRECTION']),
  notes: z.string().trim().optional(),
});

export const recipeUpdateSchema = z.object({
  productId: z.string().min(1).optional(),
  modifierId: z.string().min(1).optional(),
  ingredients: z.array(z.object({
    inventoryItemId: z.string().min(1),
    quantityRequired: z.number().positive('Quantity must be greater than zero'),
  })),
}).refine((data) => Boolean(data.productId) !== Boolean(data.modifierId), {
  message: 'Exactly one of productId or modifierId must be provided',
});
