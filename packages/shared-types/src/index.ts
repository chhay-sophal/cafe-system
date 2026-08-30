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
  amountTenderedUsd: z.number().nonnegative().optional(),
  amountTenderedRiel: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
});

export const exchangeRateSchema = z.object({
  exchangeRateRielPerUsd: z.number().positive(),
});

export const mainCurrencySchema = z.object({
  mainCurrency: z.enum(['USD', 'KHR']),
});

export const taxSettingSchema = z.object({
  taxEnabled: z.boolean(),
});

export const inventoryAdjustmentSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantityChanged: z.number(),
  type: z.enum(['RESTOCK', 'WASTAGE', 'AUDIT_CORRECTION']),
  notes: z.string().trim().optional(),
});

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  unit: z.enum(['grams', 'ml', 'pieces']),
  reorderThreshold: z.number().nonnegative(),
  costPerUnit: z.number().nonnegative(),
});

export const userRoleSchema = z.enum(['CASHIER', 'BARISTA', 'MANAGER', 'ADMIN']);

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  role: userRoleSchema,
  isActive: z.boolean().optional().default(true),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  role: userRoleSchema,
  isActive: z.boolean(),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits').optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sortOrder: z.number().int().optional().default(0),
});

export const productSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  name: z.string().trim().min(1, 'Name is required'),
  basePrice: z.number().nonnegative(),
  sku: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  isAvailable: z.boolean().optional().default(true),
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
