import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ==========================================
// 1. STAFF & AUTHENTICATION
// ==========================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pinHash: text('pin_hash').notNull(), // Hashed 4-6 digit numeric PIN for fast POS login
  role: text('role', { enum: ['CASHIER', 'BARISTA', 'MANAGER', 'ADMIN'] }).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ==========================================
// 2. PRODUCT CATALOG & MODIFIERS
// ==========================================
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // e.g., "Espresso Drinks", "Pastries", "Teas"
  sortOrder: integer('sort_order').default(0),
});

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  categoryId: text('category_id').notNull().references(() => categories.id),
  name: text('name').notNull(), // e.g., "Iced Latte"
  basePrice: real('base_price').notNull(),
  sku: text('sku'), // Barcode scanner support
  imageUrl: text('image_url'), // e.g., "/uploads/products/iced-latte.jpg"
  isAvailable: integer('is_available', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  skuIndex: uniqueIndex('idx_products_sku').on(table.sku),
  categoryIndex: index('idx_products_category').on(table.categoryId),
}));

// Groups of custom choices (e.g., "Milk Choice", "Syrup Flavour", "Sweetness Level")
export const modifierGroups = sqliteTable('modifier_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  minSelection: integer('min_selection').default(0), // 0 = optional, 1 = required
  maxSelection: integer('max_selection').default(1), // 1 = single choice, >1 = multiple
});

// Individual modifier choices (e.g., "Oat Milk", "Vanilla Syrup (+0.50)")
export const modifiers = sqliteTable('modifiers', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => modifierGroups.id),
  name: text('name').notNull(),
  priceExtra: real('price_extra').notNull().default(0.0), // Extra charge added to drink base price
});

// Many-to-Many junction mapping products to modifier groups
export const productModifiers = sqliteTable('product_modifiers', {
  productId: text('product_id').notNull().references(() => products.id),
  groupId: text('group_id').notNull().references(() => modifierGroups.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.productId, table.groupId] }),
}));

// ==========================================
// 3. INVENTORY MANAGEMENT SYSTEM (IMS)
// ==========================================
export const inventoryItems = sqliteTable('inventory_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // e.g., "Whole Milk", "Espresso Beans", "16oz Cold Cup"
  stockQuantity: real('stock_quantity').notNull().default(0), // Current stock balance
  unit: text('unit').notNull(), // "grams", "ml", "pieces"
  reorderThreshold: real('reorder_threshold').notNull().default(1000), // Minimum stock warning alert
  costPerUnit: real('cost_per_unit').notNull().default(0), // Purchase cost for COGS tracking
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true), // Retire a discontinued ingredient without losing its stock/recipe history
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Recipe Mapping: Deducts raw inventory items when a product/modifier is sold
export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id), // Link to main product
  modifierId: text('modifier_id').references(() => modifiers.id), // Link to modifier (e.g., Oat Milk extra 200ml)
  inventoryItemId: text('inventory_item_id').notNull().references(() => inventoryItems.id),
  quantityRequired: real('quantity_required').notNull(), // e.g., 18 (grams), 220 (ml), 1 (piece)
}, (table) => ({
  productIndex: index('idx_recipes_product').on(table.productId),
  modifierIndex: index('idx_recipes_modifier').on(table.modifierId),
}));

// Manual stock corrections & audits (Wastage, Spoilage, Supplier Deliveries)
export const stockAdjustments = sqliteTable('stock_adjustments', {
  id: text('id').primaryKey(),
  inventoryItemId: text('inventory_item_id').notNull().references(() => inventoryItems.id),
  userId: text('user_id').notNull().references(() => users.id), // Who adjusted it
  quantityChanged: real('quantity_changed').notNull(), // Positive for delivery, negative for waste
  type: text('type', { enum: ['RESTOCK', 'WASTAGE', 'AUDIT_CORRECTION'] }).notNull(),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ==========================================
// 4. SALES & TRANSACTIONS (POS)
// ==========================================
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id), // Cashier who placed order
  orderNumber: integer('order_number').notNull(), // Daily sequential receipt # (1, 2, 3...)
  subtotal: real('subtotal').notNull(),
  taxAmount: real('tax_amount').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  totalAmount: real('total_amount').notNull(),
  status: text('status', { enum: ['COMPLETED', 'VOIDED', 'REFUNDED'] }).notNull().default('COMPLETED'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  createdAtIndex: index('idx_orders_created_at').on(table.createdAt),
  userIndex: index('idx_orders_user').on(table.userId),
}));

export const orderItems = sqliteTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id),
  productId: text('product_id').notNull().references(() => products.id),
  productName: text('product_name').notNull(), // Preserved snapshot in case product name changes
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  totalPrice: real('total_price').notNull(),
});

export const orderItemModifiers = sqliteTable('order_item_modifiers', {
  id: text('id').primaryKey(),
  orderItemId: text('order_item_id').notNull().references(() => orderItems.id),
  modifierId: text('modifier_id').notNull().references(() => modifiers.id),
  modifierName: text('modifier_name').notNull(), // Preserved snapshot
  priceExtra: real('price_extra').notNull(),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id),
  paymentMethod: text('payment_method', { enum: ['CASH', 'CARD', 'QR_CODE'] }).notNull(),
  amountTenderedUsd: real('amount_tendered_usd').notNull().default(0), // USD cash given by customer
  amountTenderedRiel: real('amount_tendered_riel').notNull().default(0), // Riel cash given by customer
  changeGivenUsd: real('change_given_usd').notNull().default(0),
  changeGivenRiel: real('change_given_riel').notNull().default(0),
  // Snapshot of the store's USD->Riel rate at sale time - the rate drifts over
  // time, but a receipt/report must reflect what actually applied at sale.
  exchangeRateRielPerUsd: real('exchange_rate_riel_per_usd').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ==========================================
// 5. STORE SETTINGS
// ==========================================
// Single-row table (id is always 'default') holding store-wide settings that
// admins can edit without a redeploy. The USD->Riel rate converts
// prices/change to Cambodian Riel throughout IMS and POS. mainCurrency picks
// which currency is shown prominently (display only - all prices/totals are
// still stored and computed in USD regardless of this setting). taxEnabled
// lets a manager turn tax off entirely - many Cambodian SME/family-run
// stores don't charge it at all. Defaults (KHR, tax off, 4100 riel/usd)
// match how those same stores are typically set up out of the box.
export const storeSettings = sqliteTable('store_settings', {
  id: text('id').primaryKey().default('default'),
  exchangeRateRielPerUsd: real('exchange_rate_riel_per_usd').notNull().default(4100),
  mainCurrency: text('main_currency', { enum: ['USD', 'KHR'] }).notNull().default('KHR'),
  taxEnabled: integer('tax_enabled', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});