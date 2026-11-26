import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { alias, type SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { eq, sql, gte, lte, and, inArray, isNotNull, isNull, desc } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from './db/index.js';
import {
  users, categories, products, modifierGroups, modifiers, productModifiers,
  inventoryItems, recipes, stockAdjustments, orders, orderItems,
  orderItemModifiers, payments, storeSettings, posSettings,
} from './db/schema.js';
import { authenticate, hashPin, requireRole, signToken, verifyPin } from './middleware/auth.js';
import { validateBody } from './middleware/validate.js';
import { productImageUpload, saveProductImage } from './lib/uploads.js';
import { computeChange, isTenderSufficient, round2 } from './lib/cash.js';
import { BakongError, checkKhqrPaid, credentialView, generateKhqr, setRegisteredEmail } from './lib/bakong.js';
import {
  bakongCredentialSchema,
  categoryOrderSchema,
  categorySchema,
  exchangeRateSchema,
  inventoryAdjustmentSchema,
  inventoryItemSchema,
  khqrRequestSchema,
  mainCurrencySchema,
  managerApprovalSchema,
  modifierGroupSchema,
  orderEditSchema,
  orderSchema,
  pinLoginSchema,
  posSettingsSchema,
  posSettingsUpdateSchema,
  productSchema,
  recipeUpdateSchema,
  taxSettingSchema,
  userCreateSchema,
  userUpdateSchema,
  voidOrderSchema,
} from './shared-schemas.js';

const DEFAULT_EXCHANGE_RATE_RIEL_PER_USD = 4100;
const DEFAULT_MAIN_CURRENCY = 'KHR' as const;
const DEFAULT_TAX_ENABLED = false;

// Single physical cafe in Cambodia (Asia/Phnom_Penh, UTC+7, no DST) - a fixed
// offset is enough, no need for per-user timezone detection. `orders.createdAt`
// is stored via SQLite's CURRENT_TIMESTAMP (UTC), but "today"/date-range
// filters mean the store's local calendar day, so every comparison against
// createdAt needs to shift it into local time first via this SQL modifier.
const STORE_UTC_OFFSET_SQL_MODIFIER = '+7 hours';
const STORE_UTC_OFFSET_HOURS = 7;

// The store's local calendar date (YYYY-MM-DD) at `at` - by default now, the
// "today" for date-range filters - also the day an order's number counts in.
function storeTodayDateString(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + STORE_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

// Calendar arithmetic on "YYYY-MM-DD" strings (done in UTC, so no DST or
// local-timezone surprises).
function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}

// `at` in the format SQLite's CURRENT_TIMESTAMP produces (UTC, "YYYY-MM-DD
// HH:MM:SS"), for createdAt values set explicitly rather than by default.
function toSqliteTimestamp(at: Date): string {
  return at.toISOString().slice(0, 19).replace('T', ' ');
}

async function getStoreSettings(): Promise<{ exchangeRateRielPerUsd: number; mainCurrency: 'USD' | 'KHR'; taxEnabled: boolean }> {
  const row = await db.select().from(storeSettings).where(eq(storeSettings.id, 'default')).get();
  return {
    exchangeRateRielPerUsd: row?.exchangeRateRielPerUsd ?? DEFAULT_EXCHANGE_RATE_RIEL_PER_USD,
    mainCurrency: row?.mainCurrency ?? DEFAULT_MAIN_CURRENCY,
    taxEnabled: row?.taxEnabled ?? DEFAULT_TAX_ENABLED,
  };
}

// The POST /api/orders response for a sale already recorded under this
// clientOrderId, rebuilt from what was saved - so a retried request gets the
// original order number and change instead of a second copy of the sale.
async function findOrderResultByClientOrderId(clientOrderId: string) {
  const existing = await db.select({
    orderId: orders.id,
    orderNumber: orders.orderNumber,
    subtotal: orders.subtotal,
    totalAmount: orders.totalAmount,
    changeGivenUsd: payments.changeGivenUsd,
    changeGivenRiel: payments.changeGivenRiel,
    exchangeRateRielPerUsd: payments.exchangeRateRielPerUsd,
  }).from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(eq(orders.clientOrderId, clientOrderId))
    .get();

  return existing ? { success: true, ...existing } : null;
}

// Every modifier group with its options and linked product ids - the shape
// GET /api/modifiers has always returned - in three queries for the whole
// menu rather than three per group.
// Menu items, categories, modifier groups and options are soft-deleted once
// sales point to them (see their DELETE routes) - these pick the live ones.
const liveProduct = isNull(products.deletedAt);
const liveCategory = isNull(categories.deletedAt);
const liveModifierGroup = isNull(modifierGroups.deletedAt);
const liveModifier = isNull(modifiers.deletedAt);

// The ids of these options that appear on past orders.
async function findSoldModifierIds(optionIds: string[]): Promise<Set<string>> {
  if (optionIds.length === 0) {
    return new Set();
  }
  const rows = await db.selectDistinct({ modifierId: orderItemModifiers.modifierId })
    .from(orderItemModifiers)
    .where(inArray(orderItemModifiers.modifierId, optionIds))
    .all();
  return new Set(rows.map((row) => row.modifierId));
}

// Ingredient cost of one unit of each product and modifier option, from
// today's recipes and stock costs (Stock's cost per unit) - not what they
// were when a sale was made. `uncosted` lists what makes a cost incomplete:
// a product sold without a recipe counts as free, and so does an ingredient
// with no cost entered.
async function loadUnitCosts() {
  const rows = await db.select({
    productId: recipes.productId,
    modifierId: recipes.modifierId,
    quantityRequired: recipes.quantityRequired,
    ingredientName: inventoryItems.name,
    costPerUnit: inventoryItems.costPerUnit,
  }).from(recipes).innerJoin(inventoryItems, eq(recipes.inventoryItemId, inventoryItems.id)).all();

  const productCost = new Map<string, number>();
  const modifierCost = new Map<string, number>();
  // Per product / option: the names of its ingredients with no cost.
  const productUncosted = new Map<string, Set<string>>();
  const modifierUncosted = new Map<string, Set<string>>();
  for (const row of rows) {
    const [costs, uncosted, id] = row.productId
      ? [productCost, productUncosted, row.productId]
      : [modifierCost, modifierUncosted, row.modifierId];
    if (!id) continue;
    costs.set(id, (costs.get(id) ?? 0) + row.quantityRequired * row.costPerUnit);
    const names = uncosted.get(id) ?? new Set<string>();
    if (row.costPerUnit <= 0) names.add(row.ingredientName);
    uncosted.set(id, names);
  }
  return { productCost, modifierCost, productUncosted, modifierUncosted };
}

async function loadAllModifierGroups() {
  const [groups, options, links] = await Promise.all([
    db.select().from(modifierGroups).where(liveModifierGroup).all(),
    db.select().from(modifiers).where(liveModifier).all(),
    db.select().from(productModifiers).all(),
  ]);
  return groups.map((group) => ({
    ...group,
    options: options.filter((option) => option.groupId === group.id),
    productIds: links.filter((link) => link.groupId === group.id).map((link) => link.productId),
  }));
}

function liveCategoriesInOrder(executor: Pick<typeof db, 'select'> = db) {
  return executor.select().from(categories).where(liveCategory).orderBy(categories.sortOrder).all();
}

// The whole menu in one response: what GET /api/categories, /api/products
// and /api/modifiers return separately.
async function loadCatalog() {
  const [categoryRows, productRows, modifierGroupRows] = await Promise.all([
    liveCategoriesInOrder(),
    db.select().from(products).where(liveProduct).all(),
    loadAllModifierGroups(),
  ]);
  return { categories: categoryRows, products: productRows, modifierGroups: modifierGroupRows };
}

type PosSettings = z.infer<typeof posSettingsSchema>;

// What a register uses before POS settings are first saved - the defaults the
// POS has always shipped with.
const DEFAULT_POS_SETTINGS: PosSettings = {
  storeName: '',
  storeDetails: { address: '', phones: [], emails: [], socials: [] },
  paymentMethods: ['CASH', 'CARD', 'QR_CODE'],
  fastCash: {
    USD: [0.01, 0.1, 1, 5, 10, 20, 50],
    KHR: [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
  },
  khqrBanks: [],
  language: 'en-US',
  hideUnavailableItems: false,
  bakong: { accountId: '', merchantName: '', merchantCity: 'Phnom Penh' },
};

// GET /api/settings/pos's body. Sections never saved (all of them before the
// first save, or ones added since, like language) are filled with defaults
// but listed in `unsetSections` - the POS uploads its own value for those
// instead of taking the default, so a new setting can't silently change what
// the register already uses.
async function loadPosSettings() {
  const allSections = Object.keys(DEFAULT_POS_SETTINGS) as Array<keyof PosSettings>;
  const row = await db.select().from(posSettings).where(eq(posSettings.id, 'default')).get();
  if (!row) {
    return { configured: false, settings: DEFAULT_POS_SETTINGS, unsetSections: allSections, updatedAt: null as string | null };
  }
  const parsed = posSettingsSchema.partial().safeParse(JSON.parse(row.settings));
  const saved = parsed.success ? parsed.data : {};
  return {
    configured: true,
    settings: { ...DEFAULT_POS_SETTINGS, ...saved },
    unsetSections: allSections.filter((section) => !(section in saved)),
    updatedAt: row.updatedAt,
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// One sold line, as far as stock is concerned.
interface StockLine {
  productId: string;
  quantity: number;
  modifierIds: string[];
}

// Moves the recipe stock for sold lines: -1 takes it out (a sale), +1 puts it
// back (a void, or the old lines of an edit). Uses the recipes as they are
// now - recipes aren't snapshotted per order.
async function applyRecipeStock(tx: Transaction, lines: StockLine[], direction: 1 | -1) {
  for (const line of lines) {
    const recipeRows = [
      ...(await tx.select().from(recipes).where(eq(recipes.productId, line.productId)).all()),
      ...(line.modifierIds.length
        ? await tx.select().from(recipes).where(inArray(recipes.modifierId, line.modifierIds)).all()
        : []),
    ];
    for (const recipe of recipeRows) {
      await tx.update(inventoryItems)
        .set({
          stockQuantity: sql`${inventoryItems.stockQuantity} + ${direction * recipe.quantityRequired * line.quantity}`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(inventoryItems.id, recipe.inventoryItemId))
        .run();
    }
  }
}

// An order's current lines, for putting their stock back.
async function stockLinesOf(orderId: string): Promise<{ itemIds: string[]; lines: StockLine[] }> {
  const items = await db.select({ id: orderItems.id, productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems).where(eq(orderItems.orderId, orderId)).all();
  const itemModifiers = items.length
    ? await db.select({ orderItemId: orderItemModifiers.orderItemId, modifierId: orderItemModifiers.modifierId })
      .from(orderItemModifiers).where(inArray(orderItemModifiers.orderItemId, items.map((item) => item.id))).all()
    : [];
  return {
    itemIds: items.map((item) => item.id),
    lines: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      modifierIds: itemModifiers.filter((m) => m.orderItemId === item.id).map((m) => m.modifierId),
    })),
  };
}

// GET /api/orders/:id's body (also returned after an edit), or null. Times
// are store-local "YYYY-MM-DD HH:MM:SS".
async function loadOrderDetail(id: string) {
  const local = (column: SQLiteColumn) => sql<string | null>`datetime(${column}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`;
  const voider = alias(users, 'voider');
  const editor = alias(users, 'editor');
  const order = await db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    createdAt: local(orders.createdAt),
    status: orders.status,
    subtotal: orders.subtotal,
    taxAmount: orders.taxAmount,
    discountAmount: orders.discountAmount,
    totalAmount: orders.totalAmount,
    cashierName: users.name,
    voidReason: orders.voidReason,
    voidedAt: local(orders.voidedAt),
    voidedByName: voider.name,
    editReason: orders.editReason,
    editedAt: local(orders.editedAt),
    editedByName: editor.name,
  })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(voider, eq(orders.voidedBy, voider.id))
    .leftJoin(editor, eq(orders.editedBy, editor.id))
    .where(eq(orders.id, id))
    .get();

  if (!order) {
    return null;
  }

  const items = await db.select({
    id: orderItems.id,
    productId: orderItems.productId,
    productName: orderItems.productName,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    totalPrice: orderItems.totalPrice,
  }).from(orderItems).where(eq(orderItems.orderId, id)).all();

  const itemModifiers = await db.select({
    orderItemId: orderItemModifiers.orderItemId,
    modifierId: orderItemModifiers.modifierId,
    modifierName: orderItemModifiers.modifierName,
    priceExtra: orderItemModifiers.priceExtra,
  })
    .from(orderItemModifiers)
    .innerJoin(orderItems, eq(orderItemModifiers.orderItemId, orderItems.id))
    .where(eq(orderItems.orderId, id))
    .all();

  const payment = await db.select({
    paymentMethod: payments.paymentMethod,
    amountTenderedUsd: payments.amountTenderedUsd,
    amountTenderedRiel: payments.amountTenderedRiel,
    changeGivenUsd: payments.changeGivenUsd,
    changeGivenRiel: payments.changeGivenRiel,
    exchangeRateRielPerUsd: payments.exchangeRateRielPerUsd,
    khqrMd5: payments.khqrMd5,
  }).from(payments).where(eq(payments.orderId, id)).get();

  return {
    ...order,
    items: items.map((item) => ({
      ...item,
      modifiers: itemModifiers
        .filter((m) => m.orderItemId === item.id)
        .map(({ modifierId, modifierName, priceExtra }) => ({ modifierId, modifierName, priceExtra })),
    })),
    payment: payment ?? null,
  };
}

const USER_PUBLIC_COLUMNS = {
  id: users.id,
  name: users.name,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

function createApp() {
  const app = express();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  app.get('/health', (_req, res) => {
    res.sendStatus(200);
  });

  app.post('/api/upload', authenticate, requireRole(['MANAGER', 'ADMIN']), (req, res) => {
    productImageUpload.single('image')(req, res, async (error: unknown) => {
      if (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to upload image' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      try {
        const url = await saveProductImage(req.file);
        res.status(201).json({ url });
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        res.status(500).json({ error: 'Failed to upload image' });
      }
    });
  });

  app.post('/api/auth/login', validateBody(pinLoginSchema), async (req, res) => {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    try {
      const normalizedPin = String(pin).trim();
      const candidates = await db.select().from(users).all();
      let user = null as (typeof candidates[number] | null);

      for (const candidate of candidates) {
        if (!candidate.isActive) {
          continue;
        }

        const isValidPin = await verifyPin(normalizedPin, candidate.pinHash);
        if (isValidPin) {
          user = candidate;
          break;
        }
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid PIN or inactive user' });
      }

      if (!/\$2[aby]\$\d{2}\$/.test(user.pinHash)) {
        const nextHash = await hashPin(normalizedPin);
        await db.update(users)
          .set({ pinHash: nextHash })
          .where(eq(users.id, user.id))
          .run();
      }

      const token = signToken({ id: user.id, name: user.name, role: user.role });

      res.json({
        token,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        user: { id: user.id, name: user.name, role: user.role },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/logout', authenticate, (_req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
  });

  app.post('/api/auth/manager-approval', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(managerApprovalSchema), (req, res) => {
    const { action = 'general-approval', reason = 'Approved locally' } = req.body;

    res.json({ success: true, approvedBy: req.user?.name, action, reason });
  });

  app.get('/api/users', authenticate, requireRole(['ADMIN']), async (_req, res) => {
    try {
      const result = await db.select(USER_PUBLIC_COLUMNS).from(users).all();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.post('/api/users', authenticate, requireRole(['ADMIN']), validateBody(userCreateSchema), async (req, res) => {
    const { name, pin, role, isActive } = req.body;

    try {
      const id = randomUUID();
      const pinHash = await hashPin(pin);
      await db.insert(users).values({ id, name, pinHash, role, isActive }).run();

      const created = await db.select(USER_PUBLIC_COLUMNS).from(users).where(eq(users.id, id)).get();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.put('/api/users/:id', authenticate, requireRole(['ADMIN']), validateBody(userUpdateSchema), async (req, res) => {
    const id = String(req.params.id);
    const { name, role, isActive, pin } = req.body;
    const actingUserId = req.user?.id;

    try {
      const existing = await db.select().from(users).where(eq(users.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (actingUserId === id && !isActive) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
      }

      const updates: { name: string; role: typeof role; isActive: boolean; pinHash?: string } = { name, role, isActive };
      if (pin) {
        updates.pinHash = await hashPin(pin);
      }

      await db.update(users).set(updates).where(eq(users.id, id)).run();

      const updated = await db.select(USER_PUBLIC_COLUMNS).from(users).where(eq(users.id, id)).get();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // One request for the menu (IMS's Menu, Modifiers and Recipes tabs) instead
  // of three. The separate endpoints stay for older clients.
  app.get('/api/catalog', async (_req, res) => {
    try {
      res.json(await loadCatalog());
    } catch (error) {
      console.error('Fetch catalog error:', error);
      res.status(500).json({ error: 'Failed to fetch catalog' });
    }
  });

  // Everything the POS loads at start, login and Refresh menu - the menu,
  // store settings (exchange rate, currency, tax) and POS settings - in one
  // request instead of five. Public, like each of those parts.
  app.get('/api/pos/bootstrap', async (_req, res) => {
    try {
      const [catalog, storeSettings, posSettingsResult] = await Promise.all([loadCatalog(), getStoreSettings(), loadPosSettings()]);
      res.json({ ...catalog, storeSettings, posSettings: posSettingsResult });
    } catch (error) {
      console.error('Fetch POS bootstrap error:', error);
      res.status(500).json({ error: 'Failed to load POS data' });
    }
  });

  app.get('/api/categories', async (_req, res) => {
    try {
      res.json(await liveCategoriesInOrder());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  app.post('/api/categories', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(categorySchema), async (req, res) => {
    const { name, sortOrder } = req.body;

    try {
      const id = randomUUID();
      await db.insert(categories).values({ id, name, sortOrder }).run();

      const created = await db.select().from(categories).where(eq(categories.id, id)).get();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create category' });
    }
  });

  // Registered before PUT /api/categories/:id so "order" isn't matched as an id.
  app.put('/api/categories/order', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(categoryOrderSchema), async (req, res) => {
    const { categoryIds } = req.body as { categoryIds: string[] };

    try {
      // Require the complete set, so a client working from a stale list can't
      // silently drop or misplace categories it doesn't know about.
      const existing = await db.select({ id: categories.id }).from(categories).where(liveCategory).all();
      const existingIds = new Set(existing.map((category) => category.id));
      const requestedIds = new Set(categoryIds);
      if (
        requestedIds.size !== categoryIds.length
        || requestedIds.size !== existingIds.size
        || categoryIds.some((id) => !existingIds.has(id))
      ) {
        return res.status(409).json({ error: 'Category list is out of date. Reload and try again.' });
      }

      await db.transaction(async (tx) => {
        for (const [index, id] of categoryIds.entries()) {
          await tx.update(categories).set({ sortOrder: index }).where(eq(categories.id, id)).run();
        }
      });

      res.json(await liveCategoriesInOrder());
    } catch (error) {
      res.status(500).json({ error: 'Failed to reorder categories' });
    }
  });

  app.put('/api/categories/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(categorySchema), async (req, res) => {
    const id = String(req.params.id);
    const { name, sortOrder } = req.body;

    try {
      const existing = await db.select().from(categories).where(and(eq(categories.id, id), liveCategory)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Category not found' });
      }

      await db.update(categories).set({ name, sortOrder }).where(eq(categories.id, id)).run();

      const updated = await db.select().from(categories).where(eq(categories.id, id)).get();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update category' });
    }
  });

  app.delete('/api/categories/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const id = String(req.params.id);
    const reassignToCategoryId = req.query.reassignToCategoryId ? String(req.query.reassignToCategoryId) : undefined;

    try {
      const existing = await db.select().from(categories).where(and(eq(categories.id, id), liveCategory)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Category not found' });
      }

      const productsInCategory = await db.select().from(products).where(and(eq(products.categoryId, id), liveProduct)).all();
      // Deleted items that were sold still belong to it - then the category
      // is only marked deleted, so sales reports keep showing its name.
      const deletedProductRef = await db.select({ id: products.id }).from(products)
        .where(and(eq(products.categoryId, id), isNotNull(products.deletedAt)))
        .get();

      if (productsInCategory.length > 0) {
        // No target given yet - tell the client how many products are
        // affected so it can offer a "move these to..." picker instead of
        // just blocking outright.
        if (!reassignToCategoryId) {
          return res.status(409).json({
            error: `"${existing.name}" has ${productsInCategory.length} product(s) assigned to it. Choose a category to move them to before deleting.`,
            productCount: productsInCategory.length,
          });
        }

        if (reassignToCategoryId === id) {
          return res.status(400).json({ error: 'Cannot reassign products to the category being deleted' });
        }

        const targetCategory = await db.select().from(categories)
          .where(and(eq(categories.id, reassignToCategoryId), liveCategory))
          .get();
        if (!targetCategory) {
          return res.status(404).json({ error: 'Target category not found' });
        }
      }

      await db.transaction(async (tx) => {
        if (productsInCategory.length > 0 && reassignToCategoryId) {
          await tx.update(products).set({ categoryId: reassignToCategoryId })
            .where(and(eq(products.categoryId, id), liveProduct))
            .run();
        }

        if (deletedProductRef) {
          await tx.update(categories).set({ deletedAt: sql`CURRENT_TIMESTAMP` }).where(eq(categories.id, id)).run();
        } else {
          await tx.delete(categories).where(eq(categories.id, id)).run();
        }

        // Recalculate sortOrder for the remaining categories so there's no
        // gap left by the deleted one - keeps their relative order, just
        // compacted (e.g. 0,1,2,3 minus #1 becomes 0,1,2, not 0,2,3).
        const remaining = await liveCategoriesInOrder(tx);
        for (const [index, category] of remaining.entries()) {
          if (category.sortOrder !== index) {
            await tx.update(categories).set({ sortOrder: index }).where(eq(categories.id, category.id)).run();
          }
        }
      });

      // The remaining categories as renumbered, so the client can update its
      // list without reloading the menu.
      const remaining = await liveCategoriesInOrder();
      res.json({ success: true, reassignedCount: productsInCategory.length, categories: remaining });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  });

  app.get('/api/products', async (req, res) => {
    const { categoryId } = req.query;

    try {
      const query = categoryId && typeof categoryId === 'string'
        ? db.select().from(products).where(and(eq(products.categoryId, categoryId), liveProduct))
        : db.select().from(products).where(liveProduct);

      res.json(await query.all());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.post('/api/products', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(productSchema), async (req, res) => {
    const { categoryId, name, basePrice, sku, imageUrl, isAvailable } = req.body;

    try {
      const categoryExists = await db.select().from(categories).where(and(eq(categories.id, categoryId), liveCategory)).get();
      if (!categoryExists) {
        return res.status(400).json({ error: 'Selected category does not exist' });
      }

      const id = randomUUID();
      await db.insert(products).values({
        id,
        categoryId,
        name,
        basePrice,
        sku: sku || null,
        imageUrl: imageUrl || null,
        isAvailable,
      }).run();

      const created = await db.select().from(products).where(eq(products.id, id)).get();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.put('/api/products/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(productSchema), async (req, res) => {
    const id = String(req.params.id);
    const { categoryId, name, basePrice, sku, imageUrl, isAvailable } = req.body;

    try {
      const existing = await db.select().from(products).where(and(eq(products.id, id), liveProduct)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const categoryExists = await db.select().from(categories).where(and(eq(categories.id, categoryId), liveCategory)).get();
      if (!categoryExists) {
        return res.status(400).json({ error: 'Selected category does not exist' });
      }

      await db.update(products).set({
        categoryId,
        name,
        basePrice,
        sku: sku || null,
        imageUrl: imageUrl || null,
        isAvailable,
      }).where(eq(products.id, id)).run();

      const updated = await db.select().from(products).where(eq(products.id, id)).get();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const id = String(req.params.id);

    try {
      const existing = await db.select().from(products).where(and(eq(products.id, id), liveProduct)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Sold before: order history points to it, so it's only marked deleted -
      // gone from the menu, IMS and registers, but past orders, reports and
      // edits of those orders still find it. Never sold: removed outright.
      const wasSold = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, id)).get();

      await db.transaction(async (tx) => {
        await tx.delete(recipes).where(eq(recipes.productId, id)).run();
        await tx.delete(productModifiers).where(eq(productModifiers.productId, id)).run();
        if (wasSold) {
          // The barcode is freed for a new item; the name stays for history.
          await tx.update(products)
            .set({ deletedAt: sql`CURRENT_TIMESTAMP`, sku: null, isAvailable: false })
            .where(eq(products.id, id))
            .run();
        } else {
          await tx.delete(products).where(eq(products.id, id)).run();
        }
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  app.get('/api/products/:id/modifiers', async (req, res) => {
    const { id } = req.params;

    try {
      const links = await db.select().from(productModifiers).where(eq(productModifiers.productId, id)).all();
      const groupIds = links.map((link) => link.groupId);

      if (groupIds.length === 0) {
        return res.json([]);
      }

      const groups = await db.select().from(modifierGroups).where(and(inArray(modifierGroups.id, groupIds), liveModifierGroup)).all();
      const result = await Promise.all(groups.map(async (group) => {
        const options = await db.select().from(modifiers).where(and(eq(modifiers.groupId, group.id), liveModifier)).all();
        return { ...group, options };
      }));

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch product modifiers' });
    }
  });

  async function loadModifierGroup(id: string) {
    const group = await db.select().from(modifierGroups).where(and(eq(modifierGroups.id, id), liveModifierGroup)).get();
    if (!group) {
      return null;
    }
    const options = await db.select().from(modifiers).where(and(eq(modifiers.groupId, id), liveModifier)).all();
    const links = await db.select().from(productModifiers).where(eq(productModifiers.groupId, id)).all();
    return { ...group, options, productIds: links.map((link) => link.productId) };
  }

  // Returns the ids from the list that don't match a real product, so a
  // stale product picker gets a clear 400 instead of a raw FK failure.
  async function findUnknownProductIds(productIds: string[]) {
    if (productIds.length === 0) {
      return [];
    }
    const found = await db.select({ id: products.id }).from(products).where(and(inArray(products.id, productIds), liveProduct)).all();
    const foundIds = new Set(found.map((row) => row.id));
    return productIds.filter((id) => !foundIds.has(id));
  }

  app.get('/api/modifiers', async (_req, res) => {
    try {
      res.json(await loadAllModifierGroups());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch modifiers' });
    }
  });

  app.post('/api/modifiers', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(modifierGroupSchema), async (req, res) => {
    const { name, minSelection, maxSelection, options, productIds } = req.body;

    try {
      const uniqueProductIds: string[] = [...new Set<string>(productIds)];
      if ((await findUnknownProductIds(uniqueProductIds)).length > 0) {
        return res.status(400).json({ error: 'One or more selected products do not exist' });
      }

      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(modifierGroups).values({ id, name, minSelection, maxSelection }).run();
        for (const option of options) {
          await tx.insert(modifiers).values({ id: randomUUID(), groupId: id, name: option.name, priceExtra: option.priceExtra }).run();
        }
        for (const productId of uniqueProductIds) {
          await tx.insert(productModifiers).values({ productId, groupId: id }).run();
        }
      });

      res.status(201).json(await loadModifierGroup(id));
    } catch (error) {
      res.status(500).json({ error: 'Failed to create modifier group' });
    }
  });

  app.put('/api/modifiers/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(modifierGroupSchema), async (req, res) => {
    const id = String(req.params.id);
    const { name, minSelection, maxSelection, options, productIds } = req.body as {
      name: string;
      minSelection: number;
      maxSelection: number;
      options: Array<{ id?: string; name: string; priceExtra: number }>;
      productIds: string[];
    };

    try {
      const existing = await db.select().from(modifierGroups).where(and(eq(modifierGroups.id, id), liveModifierGroup)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Modifier group not found' });
      }

      const existingOptions = await db.select().from(modifiers).where(and(eq(modifiers.groupId, id), liveModifier)).all();
      const existingOptionIds = new Set(existingOptions.map((option) => option.id));

      if (options.some((option) => option.id && !existingOptionIds.has(option.id))) {
        return res.status(400).json({ error: 'An option does not belong to this modifier group' });
      }

      const keptOptionIds = new Set(options.flatMap((option) => (option.id ? [option.id] : [])));
      const removedOptions = existingOptions.filter((option) => !keptOptionIds.has(option.id));

      // Removed options that were sold are only marked deleted - past orders
      // point to them (order_item_modifiers.modifier_id is a real FK).
      const soldOptionIds = await findSoldModifierIds(removedOptions.map((option) => option.id));

      const uniqueProductIds = [...new Set(productIds)];
      if ((await findUnknownProductIds(uniqueProductIds)).length > 0) {
        return res.status(400).json({ error: 'One or more selected products do not exist' });
      }

      await db.transaction(async (tx) => {
        await tx.update(modifierGroups).set({ name, minSelection, maxSelection }).where(eq(modifierGroups.id, id)).run();

        for (const option of removedOptions) {
          await tx.delete(recipes).where(eq(recipes.modifierId, option.id)).run();
          if (soldOptionIds.has(option.id)) {
            await tx.update(modifiers).set({ deletedAt: sql`CURRENT_TIMESTAMP` }).where(eq(modifiers.id, option.id)).run();
          } else {
            await tx.delete(modifiers).where(eq(modifiers.id, option.id)).run();
          }
        }

        for (const option of options) {
          if (option.id) {
            await tx.update(modifiers).set({ name: option.name, priceExtra: option.priceExtra }).where(eq(modifiers.id, option.id)).run();
          } else {
            await tx.insert(modifiers).values({ id: randomUUID(), groupId: id, name: option.name, priceExtra: option.priceExtra }).run();
          }
        }

        await tx.delete(productModifiers).where(eq(productModifiers.groupId, id)).run();
        for (const productId of uniqueProductIds) {
          await tx.insert(productModifiers).values({ productId, groupId: id }).run();
        }
      });

      res.json(await loadModifierGroup(id));
    } catch (error) {
      res.status(500).json({ error: 'Failed to update modifier group' });
    }
  });

  app.delete('/api/modifiers/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const id = String(req.params.id);

    try {
      const existing = await db.select().from(modifierGroups).where(and(eq(modifierGroups.id, id), liveModifierGroup)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Modifier group not found' });
      }

      // Every option, including ones removed earlier (already marked deleted).
      const optionIds = (await db.select({ id: modifiers.id }).from(modifiers).where(eq(modifiers.groupId, id)).all())
        .map((option) => option.id);
      // Options that were sold are only marked deleted, and the group with
      // them, so past orders keep pointing at them. The rest go outright.
      const soldOptionIds = await findSoldModifierIds(optionIds);
      const unsoldOptionIds = optionIds.filter((optionId) => !soldOptionIds.has(optionId));

      await db.transaction(async (tx) => {
        if (optionIds.length > 0) {
          await tx.delete(recipes).where(inArray(recipes.modifierId, optionIds)).run();
        }
        await tx.delete(productModifiers).where(eq(productModifiers.groupId, id)).run();
        if (unsoldOptionIds.length > 0) {
          await tx.delete(modifiers).where(inArray(modifiers.id, unsoldOptionIds)).run();
        }
        if (soldOptionIds.size > 0) {
          await tx.update(modifiers)
            .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
            .where(and(inArray(modifiers.id, [...soldOptionIds]), liveModifier))
            .run();
          await tx.update(modifierGroups).set({ deletedAt: sql`CURRENT_TIMESTAMP` }).where(eq(modifierGroups.id, id)).run();
        } else {
          await tx.delete(modifierGroups).where(eq(modifierGroups.id, id)).run();
        }
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete modifier group' });
    }
  });

  app.post('/api/orders', authenticate, validateBody(orderSchema), async (req, res) => {
    const {
      clientOrderId, soldAt, exchangeRateRielPerUsd: saleExchangeRate, items, paymentMethod, amountTenderedUsd = 0, amountTenderedRiel = 0, taxAmount: requestedTaxAmount = 0, discountAmount = 0,
      khqrMd5,
    } = req.body;
    const actingUserId = req.user?.id;

    if (!actingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // A retry of a sale that already went through - typically the POS timed
      // out waiting for the first response and queued the sale offline. Not
      // scoped to the caller: the queue may replay it after a cashier change.
      if (clientOrderId) {
        const existing = await findOrderResultByClientOrderId(clientOrderId);
        if (existing) {
          return res.status(200).json(existing);
        }
      }

      // A sale rung up offline is recorded at the time it happened, not when it
      // finally synced - but never in the future, so a register whose clock
      // runs fast can't stamp a sale ahead of now.
      const saleTime = new Date(Math.min(soldAt ? Date.parse(soldAt) : Infinity, Date.now()));
      // Numbered within the day it was sold, which for an offline sale synced
      // the next morning is the previous day.
      const saleDay = storeTodayDateString(saleTime);
      const lastOrderNumber = (await db.select({ max: sql<number | null>`max(${orders.orderNumber})` })
        .from(orders)
        .where(eq(sql`date(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`, saleDay))
        .get())?.max ?? 0;
      const orderNumber = lastOrderNumber + 1;
      const orderId = randomUUID();

      let subtotal = 0;
      for (const item of items) {
        let itemPrice = item.unitPrice;
        if (item.selectedModifiers) {
          for (const mod of item.selectedModifiers) {
            itemPrice += mod.priceExtra;
          }
        }
        subtotal += itemPrice * item.quantity;
      }

      const { exchangeRateRielPerUsd: storeExchangeRate, taxEnabled } = await getStoreSettings();
      // An offline sale's cash changed hands at the rate the register had then,
      // so tender and change are checked and recorded at that rate - otherwise
      // a rate change before it syncs could reject a sale already paid for.
      const exchangeRate = saleExchangeRate ?? storeExchangeRate;
      // A manager can disable tax store-wide - enforced here, not just
      // trusted from the client, so a stale/misbehaving POS can't still
      // charge it once disabled.
      const taxAmount = taxEnabled ? requestedTaxAmount : 0;
      const totalAmount = subtotal + taxAmount - discountAmount;

      let paymentUsd = totalAmount;
      let paymentRiel = 0;
      let changeUsd = 0;
      let changeRiel = 0;

      if (paymentMethod === 'CASH') {
        const tenderedTotalUsd = amountTenderedUsd + amountTenderedRiel / exchangeRate;
        if (!isTenderSufficient(totalAmount, exchangeRate, amountTenderedUsd, amountTenderedRiel)) {
          return res.status(400).json({ error: 'Insufficient payment' });
        }

        paymentUsd = amountTenderedUsd;
        paymentRiel = amountTenderedRiel;
        const changeDueUsd = Math.max(0, round2(tenderedTotalUsd - totalAmount));
        const change = computeChange(changeDueUsd, exchangeRate, amountTenderedUsd, amountTenderedRiel);
        changeUsd = change.usd;
        changeRiel = change.riel;
      }

      await db.transaction(async (tx) => {
        await tx.insert(orders).values({
          id: orderId,
          clientOrderId,
          createdAt: toSqliteTimestamp(saleTime),
          userId: actingUserId,
          orderNumber,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          status: 'COMPLETED',
        }).run();

        await tx.insert(payments).values({
          id: randomUUID(),
          orderId,
          paymentMethod,
          amountTenderedUsd: paymentUsd,
          amountTenderedRiel: paymentRiel,
          changeGivenUsd: changeUsd,
          changeGivenRiel: changeRiel,
          exchangeRateRielPerUsd: exchangeRate,
          khqrMd5: paymentMethod === 'QR_CODE' ? khqrMd5 ?? null : null,
        }).run();

        for (const item of items) {
          const orderItemId = randomUUID();

          await tx.insert(orderItems).values({
            id: orderItemId,
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
          }).run();

          const baseRecipes = await tx.select().from(recipes).where(eq(recipes.productId, item.productId)).all();
          for (const recipe of baseRecipes) {
            const totalDeduction = recipe.quantityRequired * item.quantity;
            await tx.update(inventoryItems)
              .set({
                stockQuantity: sql`${inventoryItems.stockQuantity} - ${totalDeduction}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(inventoryItems.id, recipe.inventoryItemId))
              .run();
          }

          if (item.selectedModifiers && item.selectedModifiers.length) {
            for (const mod of item.selectedModifiers) {
              await tx.insert(orderItemModifiers).values({
                id: randomUUID(),
                orderItemId,
                modifierId: mod.id,
                modifierName: mod.name,
                priceExtra: mod.priceExtra,
              }).run();

              const modRecipes = await tx.select().from(recipes).where(eq(recipes.modifierId, mod.id)).all();
              for (const recipe of modRecipes) {
                const totalDeduction = recipe.quantityRequired * item.quantity;
                await tx.update(inventoryItems)
                  .set({
                    stockQuantity: sql`${inventoryItems.stockQuantity} - ${totalDeduction}`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                  })
                  .where(eq(inventoryItems.id, recipe.inventoryItemId))
                  .run();
              }
            }
          }
        }
      });

      res.status(201).json({
        success: true,
        orderId,
        orderNumber,
        subtotal,
        totalAmount,
        changeGivenUsd: changeUsd,
        changeGivenRiel: changeRiel,
        exchangeRateRielPerUsd: exchangeRate,
      });
    } catch (error) {
      // Lost a race with a concurrent copy of the same sale (the unique index
      // on client_order_id rejected this insert) - answer with the one that won.
      if (clientOrderId) {
        const existing = await findOrderResultByClientOrderId(clientOrderId).catch(() => null);
        if (existing) {
          return res.status(200).json(existing);
        }
      }
      console.error('Order creation error:', error);
      res.status(500).json({ error: 'Failed to process sale' });
    }
  });

  // Every IMS login is already MANAGER or ADMIN (see useAuth's login gate on
  // the frontend), so plain `authenticate` - without a role check - matches
  // how the rest of the Analytics tab is already gated.
  app.get('/api/orders', authenticate, async (req, res) => {
    const startDate = (req.query.startDate as string) || storeTodayDateString();
    const endDate = (req.query.endDate as string) || startDate;
    // Same store-local day boundary logic as the daily-summary report.
    const localCreatedAt = sql`datetime(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`;
    // `mine=true` narrows the list to the caller's own sales - the POS's
    // Sales History tab, where a cashier reviews only their own shift.
    const onlyMineUserId = req.query.mine === 'true' ? req.user?.id : undefined;
    const dateCondition = and(
      gte(localCreatedAt, `${startDate} 00:00:00`),
      lte(localCreatedAt, `${endDate} 23:59:59`),
      onlyMineUserId ? eq(orders.userId, onlyMineUserId) : undefined,
    );

    try {
      const rows = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: localCreatedAt,
        status: orders.status,
        subtotal: orders.subtotal,
        taxAmount: orders.taxAmount,
        discountAmount: orders.discountAmount,
        totalAmount: orders.totalAmount,
        cashierName: users.name,
        paymentMethod: payments.paymentMethod,
        itemCount: sql<number>`(select count(*) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
        isEdited: sql<boolean>`${orders.editedAt} is not null`.mapWith(Boolean),
      })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(payments, eq(payments.orderId, orders.id))
        .where(dateCondition)
        .orderBy(desc(orders.createdAt))
        .all();

      // What each order sold, for finding orders by item: the product id for
      // an exact filter (a renamed product keeps it) and the name as rung up
      // for search. One query for the whole list, grouped here.
      const soldLines = await db.selectDistinct({
        orderId: orderItems.orderId,
        id: orderItems.productId,
        name: orderItems.productName,
      })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(dateCondition)
        .all();
      const productsByOrder = new Map<string, Array<{ id: string; name: string }>>();
      for (const { orderId, id, name } of soldLines) {
        const products = productsByOrder.get(orderId) ?? [];
        products.push({ id, name });
        productsByOrder.set(orderId, products);
      }

      res.json(rows.map((row) => ({ ...row, products: productsByOrder.get(row.id) ?? [] })));
    } catch (error) {
      console.error('Fetch orders error:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  app.get('/api/orders/:id', authenticate, async (req, res) => {
    try {
      const order = await loadOrderDetail(String(req.params.id));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(order);
    } catch (error) {
      console.error('Fetch order detail error:', error);
      res.status(500).json({ error: 'Failed to fetch order detail' });
    }
  });

  // Managers and admins correct a completed sale from IMS: its items, payment
  // method and discount, with a reason. Totals are recalculated, stock moves
  // with the items (the old lines' recipes go back, the new ones come out),
  // and the latest edit's who/when/why is kept on the order. The order
  // number, time and cashier stay as rung up.
  app.put('/api/orders/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(orderEditSchema), async (req, res) => {
    const id = String(req.params.id);
    const { items, paymentMethod, discountAmount, reason } = req.body as {
      items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; selectedModifiers?: Array<{ id: string; name: string; priceExtra: number }> }>;
      paymentMethod: 'CASH' | 'CARD' | 'QR_CODE';
      discountAmount: number;
      reason: string;
    };
    const actingUserId = req.user!.id;

    try {
      const order = await db.select({ status: orders.status, subtotal: orders.subtotal, taxAmount: orders.taxAmount })
        .from(orders).where(eq(orders.id, id)).get();
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (order.status !== 'COMPLETED') {
        return res.status(409).json({ error: 'Only completed orders can be edited' });
      }
      const payment = await db.select().from(payments).where(eq(payments.orderId, id)).get();
      if (!payment) {
        return res.status(409).json({ error: 'This order has no payment record to update' });
      }

      // Checked up front so a bad id is a clear 400, not a foreign key error.
      const productIds = [...new Set(items.map((item) => item.productId))];
      const modifierIds = [...new Set(items.flatMap((item) => item.selectedModifiers?.map((m) => m.id) ?? []))];
      const knownProducts = await db.select({ id: products.id }).from(products).where(inArray(products.id, productIds)).all();
      const knownModifiers = modifierIds.length
        ? await db.select({ id: modifiers.id }).from(modifiers).where(inArray(modifiers.id, modifierIds)).all()
        : [];
      if (knownProducts.length !== productIds.length || knownModifiers.length !== modifierIds.length) {
        return res.status(400).json({ error: 'An item or option on this order no longer exists' });
      }

      const subtotal = round2(items.reduce(
        (sum, item) => sum + (item.unitPrice + (item.selectedModifiers ?? []).reduce((extras, m) => extras + m.priceExtra, 0)) * item.quantity,
        0,
      ));
      if (discountAmount > subtotal) {
        return res.status(400).json({ error: "The discount can't be more than the subtotal" });
      }
      // The tax rate the sale was actually charged (the POS adds tax as a
      // share of the subtotal while tax is on), applied to the new subtotal -
      // so turning tax on or off since doesn't rewrite an old sale's tax.
      const taxAmount = order.taxAmount > 0 && order.subtotal > 0 ? round2(subtotal * (order.taxAmount / order.subtotal)) : 0;
      const totalAmount = round2(subtotal + taxAmount - discountAmount);

      // Cash that still covers the new total is kept as handed over, with the
      // change worked out again. Otherwise - another method, or cash that no
      // longer covers it (the original record was the mistake) - the sale is
      // recorded as paid exactly, so takings always match the total.
      const rate = payment.exchangeRateRielPerUsd;
      let tendered = { usd: totalAmount, riel: 0 };
      let change = { usd: 0, riel: 0 };
      if (paymentMethod === 'CASH' && payment.paymentMethod === 'CASH'
        && isTenderSufficient(totalAmount, rate, payment.amountTenderedUsd, payment.amountTenderedRiel)) {
        tendered = { usd: payment.amountTenderedUsd, riel: payment.amountTenderedRiel };
        const changeDueUsd = Math.max(0, round2(tendered.usd + tendered.riel / rate - totalAmount));
        change = computeChange(changeDueUsd, rate, tendered.usd, tendered.riel);
      }

      const previous = await stockLinesOf(id);
      const newLines = items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        modifierIds: (item.selectedModifiers ?? []).map((m) => m.id),
      }));

      const wasEdited = await db.transaction(async (tx) => {
        // Conditional on status, so an order voided meanwhile isn't edited.
        const update = await tx.update(orders)
          .set({
            subtotal,
            taxAmount,
            discountAmount,
            totalAmount,
            editedAt: sql`CURRENT_TIMESTAMP`,
            editedBy: actingUserId,
            editReason: reason,
          })
          .where(and(eq(orders.id, id), eq(orders.status, 'COMPLETED')))
          .run();
        if (update.rowsAffected === 0) {
          return false;
        }

        await applyRecipeStock(tx, previous.lines, 1);
        if (previous.itemIds.length) {
          await tx.delete(orderItemModifiers).where(inArray(orderItemModifiers.orderItemId, previous.itemIds)).run();
        }
        await tx.delete(orderItems).where(eq(orderItems.orderId, id)).run();

        for (const item of items) {
          const orderItemId = randomUUID();
          await tx.insert(orderItems).values({
            id: orderItemId,
            orderId: id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
          }).run();
          for (const modifier of item.selectedModifiers ?? []) {
            await tx.insert(orderItemModifiers).values({
              id: randomUUID(),
              orderItemId,
              modifierId: modifier.id,
              modifierName: modifier.name,
              priceExtra: modifier.priceExtra,
            }).run();
          }
        }
        await applyRecipeStock(tx, newLines, -1);

        await tx.update(payments)
          .set({
            paymentMethod,
            // The Bakong confirmation only describes a Mobile Pay sale.
            ...(paymentMethod === 'QR_CODE' ? {} : { khqrMd5: null }),
            amountTenderedUsd: tendered.usd,
            amountTenderedRiel: tendered.riel,
            changeGivenUsd: change.usd,
            changeGivenRiel: change.riel,
          })
          .where(eq(payments.id, payment.id))
          .run();

        return true;
      });

      if (!wasEdited) {
        return res.status(409).json({ error: 'Only completed orders can be edited' });
      }

      res.json(await loadOrderDetail(id));
    } catch (error) {
      console.error('Edit order error:', error);
      res.status(500).json({ error: 'Failed to edit order' });
    }
  });

  // Cashiers may void only their own sales from the current store day (a
  // mistaken ring-up, a customer who changed their mind); managers and
  // admins may void any order. Voiding keeps the order and its payment rows
  // for the audit trail, flips the status, and returns the recipe stock the
  // sale deducted.
  app.post('/api/orders/:id/void', authenticate, validateBody(voidOrderSchema), async (req, res) => {
    const id = String(req.params.id);
    const { reason } = req.body;
    const actingUser = req.user;

    if (!actingUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const order = await db.select({
        userId: orders.userId,
        status: orders.status,
        localDate: sql<string>`date(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`,
      }).from(orders).where(eq(orders.id, id)).get();

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const isManager = actingUser.role === 'MANAGER' || actingUser.role === 'ADMIN';
      if (!isManager && (order.userId !== actingUser.id || order.localDate !== storeTodayDateString())) {
        return res.status(403).json({ error: 'You can only void your own orders from today' });
      }

      if (order.status !== 'COMPLETED') {
        return res.status(409).json({ error: 'Only completed orders can be voided' });
      }

      const { lines: soldLines } = await stockLinesOf(id);

      const wasVoided = await db.transaction(async (tx) => {
        // Conditional on status so two simultaneous voids can't both
        // restock - only the one that actually flips the status proceeds.
        const update = await tx.update(orders)
          .set({ status: 'VOIDED', voidedAt: sql`CURRENT_TIMESTAMP`, voidedBy: actingUser.id, voidReason: reason })
          .where(and(eq(orders.id, id), eq(orders.status, 'COMPLETED')))
          .run();
        if (update.rowsAffected === 0) {
          return false;
        }

        // Puts back what the sale took - normally with the same recipes, since
        // voids happen the same day.
        await applyRecipeStock(tx, soldLines, 1);
        return true;
      });

      if (!wasVoided) {
        return res.status(409).json({ error: 'Only completed orders can be voided' });
      }

      res.json({ success: true, orderId: id, status: 'VOIDED' });
    } catch (error) {
      console.error('Void order error:', error);
      res.status(500).json({ error: 'Failed to void order' });
    }
  });

  // Public like the exchange rate: the POS shows the store name and receipt
  // header before anyone logs in, and none of it is secret.
  app.get('/api/settings/pos', async (_req, res) => {
    try {
      res.json(await loadPosSettings());
    } catch (error) {
      console.error('Fetch POS settings error:', error);
      res.status(500).json({ error: 'Failed to fetch POS settings' });
    }
  });

  // Saves the sections sent and keeps the rest, so IMS and a register editing
  // different sections at the same time don't overwrite each other.
  app.put('/api/settings/pos', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(posSettingsUpdateSchema), async (req, res) => {
    try {
      // Only sections actually saved before, plus the new ones - so saving one
      // section doesn't store defaults for the others and mark them as set.
      const row = await db.select().from(posSettings).where(eq(posSettings.id, 'default')).get();
      const parsed = row ? posSettingsSchema.partial().safeParse(JSON.parse(row.settings)) : null;
      const merged = posSettingsSchema.partial().parse({ ...(parsed?.success ? parsed.data : {}), ...req.body });
      await db.insert(posSettings)
        .values({ id: 'default', settings: JSON.stringify(merged), updatedBy: req.user!.id })
        .onConflictDoUpdate({
          target: posSettings.id,
          set: { settings: JSON.stringify(merged), updatedBy: req.user!.id, updatedAt: sql`CURRENT_TIMESTAMP` },
        })
        .run();
      res.json(await loadPosSettings());
    } catch (error) {
      console.error('Update POS settings error:', error);
      res.status(500).json({ error: 'Failed to update POS settings' });
    }
  });

  app.get('/api/settings/exchange-rate', async (_req, res) => {
    try {
      res.json(await getStoreSettings());
    } catch (error) {
      console.error('Fetch exchange rate error:', error);
      res.status(500).json({ error: 'Failed to fetch exchange rate' });
    }
  });

  app.put('/api/settings/exchange-rate', authenticate, requireRole(['ADMIN']), validateBody(exchangeRateSchema), async (req, res) => {
    const { exchangeRateRielPerUsd } = req.body;

    try {
      await db.insert(storeSettings)
        .values({ id: 'default', exchangeRateRielPerUsd })
        .onConflictDoUpdate({
          target: storeSettings.id,
          set: { exchangeRateRielPerUsd, updatedAt: sql`CURRENT_TIMESTAMP` },
        })
        .run();

      res.json({ exchangeRateRielPerUsd });
    } catch (error) {
      console.error('Update exchange rate error:', error);
      res.status(500).json({ error: 'Failed to update exchange rate' });
    }
  });

  app.put('/api/settings/main-currency', authenticate, requireRole(['ADMIN']), validateBody(mainCurrencySchema), async (req, res) => {
    const { mainCurrency } = req.body;

    try {
      await db.insert(storeSettings)
        .values({ id: 'default', mainCurrency })
        .onConflictDoUpdate({
          target: storeSettings.id,
          set: { mainCurrency, updatedAt: sql`CURRENT_TIMESTAMP` },
        })
        .run();

      res.json({ mainCurrency });
    } catch (error) {
      console.error('Update main currency error:', error);
      res.status(500).json({ error: 'Failed to update main currency' });
    }
  });

  app.put('/api/settings/tax', authenticate, requireRole(['ADMIN']), validateBody(taxSettingSchema), async (req, res) => {
    const { taxEnabled } = req.body;

    try {
      await db.insert(storeSettings)
        .values({ id: 'default', taxEnabled })
        .onConflictDoUpdate({
          target: storeSettings.id,
          set: { taxEnabled, updatedAt: sql`CURRENT_TIMESTAMP` },
        })
        .run();

      res.json({ taxEnabled });
    } catch (error) {
      console.error('Update tax setting error:', error);
      res.status(500).json({ error: 'Failed to update tax setting' });
    }
  });

  app.get('/api/inventory', authenticate, requireRole(['MANAGER', 'ADMIN']), async (_req, res) => {
    try {
      const items = await db.select().from(inventoryItems).all();
      const result = items.map((item) => ({ ...item, isLowStock: item.stockQuantity <= item.reorderThreshold }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inventory stock' });
    }
  });

  app.post('/api/inventory', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(inventoryItemSchema), async (req, res) => {
    const { name, unit, reorderThreshold, costPerUnit, isActive } = req.body;

    try {
      const id = randomUUID();
      await db.insert(inventoryItems).values({ id, name, unit, reorderThreshold, costPerUnit, isActive, stockQuantity: 0 }).run();

      const created = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get())!;
      res.status(201).json({ ...created, isLowStock: created.stockQuantity <= created.reorderThreshold });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create inventory item' });
    }
  });

  app.put('/api/inventory/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(inventoryItemSchema), async (req, res) => {
    const id = String(req.params.id);
    const { name, unit, reorderThreshold, costPerUnit, isActive } = req.body;

    try {
      const existing = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }

      await db.update(inventoryItems)
        .set({ name, unit, reorderThreshold, costPerUnit, isActive, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(inventoryItems.id, id))
        .run();

      const updated = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get())!;
      res.json({ ...updated, isLowStock: updated.stockQuantity <= updated.reorderThreshold });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update inventory item' });
    }
  });

  app.delete('/api/inventory/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const id = String(req.params.id);

    try {
      const existing = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }

      const linkedRecipes = await db.select().from(recipes).where(eq(recipes.inventoryItemId, id)).all();
      if (linkedRecipes.length > 0) {
        return res.status(409).json({
          error: `"${existing.name}" is used in ${linkedRecipes.length} recipe(s). Remove the recipe link(s) before deleting this item.`,
        });
      }

      // Turso enforces foreign keys (unlike the old better-sqlite3 setup,
      // which silently orphaned these rows) - stock_adjustments.inventoryItemId
      // references this row, so a real audit history blocks deletion the
      // same way linked recipes do, rather than surfacing as a raw 500.
      const linkedAdjustments = await db.select().from(stockAdjustments).where(eq(stockAdjustments.inventoryItemId, id)).all();
      if (linkedAdjustments.length > 0) {
        return res.status(409).json({
          error: `"${existing.name}" has ${linkedAdjustments.length} stock adjustment record(s) and cannot be deleted.`,
        });
      }

      await db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete inventory item' });
    }
  });

  app.post('/api/inventory/adjust', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(inventoryAdjustmentSchema), async (req, res) => {
    const { inventoryItemId, quantityChanged, type, notes } = req.body;
    const actingUserId = req.user?.id;

    if (!inventoryItemId || !actingUserId || quantityChanged === undefined || !type) {
      return res.status(400).json({ error: 'Missing required adjustment parameters' });
    }

    try {
      await db.transaction(async (tx) => {
        await tx.insert(stockAdjustments).values({
          id: randomUUID(),
          inventoryItemId,
          userId: actingUserId,
          quantityChanged,
          type,
          notes,
        }).run();

        await tx.update(inventoryItems)
          .set({
            stockQuantity: sql`${inventoryItems.stockQuantity} + ${quantityChanged}`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(inventoryItems.id, inventoryItemId))
          .run();
      });

      // The item as it now stands, so the client can update its row without
      // reloading the whole inventory.
      const updated = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId)).get();
      res.json({ success: true, item: updated ? { ...updated, isLowStock: updated.stockQuantity <= updated.reorderThreshold } : null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update stock adjustment' });
    }
  });

  app.get('/api/recipes/summary', authenticate, requireRole(['MANAGER', 'ADMIN']), async (_req, res) => {
    try {
      const productCounts = await db.select({
        id: recipes.productId,
        ingredientCount: sql<number>`count(*)`,
      }).from(recipes).where(isNotNull(recipes.productId)).groupBy(recipes.productId).all();

      const modifierCounts = await db.select({
        id: recipes.modifierId,
        ingredientCount: sql<number>`count(*)`,
      }).from(recipes).where(isNotNull(recipes.modifierId)).groupBy(recipes.modifierId).all();

      res.json({ products: productCounts, modifiers: modifierCounts });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch recipe summary' });
    }
  });

  app.delete('/api/recipes/:productId', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const productId = String(req.params.productId);

    try {
      const existing = await db.select().from(products).where(eq(products.id, productId)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      await db.delete(recipes).where(eq(recipes.productId, productId)).run();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete recipe' });
    }
  });

  app.get('/api/recipes', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const { productId, modifierId } = req.query;

    if (!productId && !modifierId) {
      return res.status(400).json({ error: 'productId or modifierId query parameter is required' });
    }

    try {
      const condition = productId && typeof productId === 'string'
        ? eq(recipes.productId, productId)
        : eq(recipes.modifierId, String(modifierId));

      const rows = await db.select({
        id: recipes.id,
        inventoryItemId: recipes.inventoryItemId,
        quantityRequired: recipes.quantityRequired,
        inventoryItemName: inventoryItems.name,
        inventoryItemUnit: inventoryItems.unit,
      }).from(recipes)
        .innerJoin(inventoryItems, eq(recipes.inventoryItemId, inventoryItems.id))
        .where(condition)
        .all();

      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch recipe' });
    }
  });

  app.put('/api/recipes', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(recipeUpdateSchema), async (req, res) => {
    const { productId, modifierId, ingredients } = req.body;

    try {
      await db.transaction(async (tx) => {
        const condition = productId
          ? eq(recipes.productId, productId)
          : eq(recipes.modifierId, modifierId);

        await tx.delete(recipes).where(condition).run();

        for (const ingredient of ingredients) {
          await tx.insert(recipes).values({
            id: randomUUID(),
            productId: productId ?? null,
            modifierId: modifierId ?? null,
            inventoryItemId: ingredient.inventoryItemId,
            quantityRequired: ingredient.quantityRequired,
          }).run();
        }
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save recipe' });
    }
  });

  // Revenue figures - managers and admins only (every IMS login is one).
  app.get('/api/reports/daily-summary', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const startDate = (req.query.startDate as string) || storeTodayDateString();
    const endDate = (req.query.endDate as string) || startDate;
    if (!isDateString(startDate) || !isDateString(endDate) || startDate > endDate) {
      return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD, startDate first' });
    }
    // The same number of days immediately before, for the "vs previous period"
    // comparison on the summary cards.
    const periodDays = daysBetween(startDate, endDate) + 1;
    const previousEndDate = shiftDate(startDate, -1);
    const previousStartDate = shiftDate(startDate, -periodDays);

    // startDate/endDate are store-local calendar days (see storeTodayDateString),
    // but createdAt is stored in UTC - shift it to local time before comparing,
    // otherwise the boundary is off by the store's UTC offset.
    const localCreatedAt = sql`datetime(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`;
    const completedBetween = (from: string, to: string) => and(
      gte(localCreatedAt, `${from} 00:00:00`),
      lte(localCreatedAt, `${to} 23:59:59`),
      eq(orders.status, 'COMPLETED'),
    );
    const dateCondition = completedBetween(startDate, endDate);

    // SUM() over zero matching rows returns NULL, not 0 - coalesce so an empty
    // date range reports clean zeros instead of nulls the frontend would have
    // to guard against. Money sums come out of SQLite as raw floats (Riel
    // converted back to USD rarely lands on whole cents), so they're rounded
    // to cents before being sent.
    // What was sold in a period, for item counts and ingredient cost: units
    // per product, and per modifier option the units of the items it was
    // chosen on (an option's recipe is used once per unit, like the stock
    // deduction at sale time).
    const soldUnits = async (from: string, to: string) => {
      const [byProduct, byModifier] = await Promise.all([
        db.select({ productId: orderItems.productId, quantity: sql<number>`sum(${orderItems.quantity})` })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .where(completedBetween(from, to))
          .groupBy(orderItems.productId)
          .all(),
        db.select({
          productId: orderItems.productId,
          modifierId: orderItemModifiers.modifierId,
          quantity: sql<number>`sum(${orderItems.quantity})`,
        })
          .from(orderItemModifiers)
          .innerJoin(orderItems, eq(orderItemModifiers.orderItemId, orderItems.id))
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .where(completedBetween(from, to))
          .groupBy(orderItems.productId, orderItemModifiers.modifierId)
          .all(),
      ]);
      return { byProduct, byModifier };
    };

    const summarize = async (from: string, to: string, unitCosts: Awaited<ReturnType<typeof loadUnitCosts>>) => {
      const [row, voided, sold] = await Promise.all([
        db.select({
          totalOrders: sql<number>`count(${orders.id})`,
          grossRevenue: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
          totalTax: sql<number>`coalesce(sum(${orders.taxAmount}), 0)`,
          totalDiscounts: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`,
          netRevenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
        }).from(orders).where(completedBetween(from, to)).get(),
        // Voided sales, by when they were rung up - money that was taken and
        // given back, worth watching.
        db.select({
          count: sql<number>`count(${orders.id})`,
          amount: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
        }).from(orders).where(and(
          gte(localCreatedAt, `${from} 00:00:00`),
          lte(localCreatedAt, `${to} 23:59:59`),
          eq(orders.status, 'VOIDED'),
        )).get(),
        soldUnits(from, to),
      ]);
      const ingredientCost = sold.byProduct.reduce((sum, line) => sum + line.quantity * (unitCosts.productCost.get(line.productId) ?? 0), 0)
        + sold.byModifier.reduce((sum, line) => sum + line.quantity * (unitCosts.modifierCost.get(line.modifierId) ?? 0), 0);
      const grossRevenue = row?.grossRevenue ?? 0;
      const totalDiscounts = row?.totalDiscounts ?? 0;
      return {
        totalOrders: row?.totalOrders ?? 0,
        itemsSold: sold.byProduct.reduce((sum, line) => sum + line.quantity, 0),
        grossRevenue: round2(grossRevenue),
        totalTax: round2(row?.totalTax ?? 0),
        totalDiscounts: round2(totalDiscounts),
        netRevenue: round2(row?.netRevenue ?? 0),
        // Sales before tax and after discounts, less what the ingredients cost.
        ingredientCost: round2(ingredientCost),
        grossProfit: round2(grossRevenue - totalDiscounts - ingredientCost),
        voidedOrders: voided?.count ?? 0,
        voidedAmount: round2(voided?.amount ?? 0),
        sold,
      };
    };

    try {
      const unitCosts = await loadUnitCosts();
      const [{ sold, ...metrics }, { sold: _previousSold, ...previousMetrics }] = await Promise.all([
        summarize(startDate, endDate, unitCosts),
        summarize(previousStartDate, previousEndDate, unitCosts),
      ]);

      // Riel legs are converted back to USD via each row's own snapshotted
      // rate, since the store's rate can change between orders.
      const paymentBreakdown = await db.select({
        method: payments.paymentMethod,
        totalAmount: sql<number>`sum(
          (${payments.amountTenderedUsd} + ${payments.amountTenderedRiel} / ${payments.exchangeRateRielPerUsd})
          - (${payments.changeGivenUsd} + ${payments.changeGivenRiel} / ${payments.exchangeRateRielPerUsd})
        )`,
      }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).where(dateCondition).groupBy(payments.paymentMethod).all();

      const hourlyRows = await db.select({
        hour: sql<string>`strftime('%H', ${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`,
        orderCount: sql<number>`count(${orders.id})`,
        revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
      }).from(orders).where(dateCondition).groupBy(sql`strftime('%H', ${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`).all();

      const hourlyByHour = new Map(hourlyRows.map((row) => [Number(row.hour), row]));
      const hourlyVolume = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        orderCount: hourlyByHour.get(hour)?.orderCount ?? 0,
        revenue: round2(hourlyByHour.get(hour)?.revenue ?? 0),
      }));

      // One entry per store-local day in the range - days without sales
      // included, as zeros, so the trend shows the gaps.
      const localDay = sql<string>`date(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`;
      const dailyRows = await db.select({
        date: localDay,
        orderCount: sql<number>`count(${orders.id})`,
        revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
      }).from(orders).where(dateCondition).groupBy(localDay).all();
      const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]));
      const dailyVolume = Array.from({ length: periodDays }, (_, offset) => {
        const date = shiftDate(startDate, offset);
        return {
          date,
          orderCount: dailyByDate.get(date)?.orderCount ?? 0,
          revenue: round2(dailyByDate.get(date)?.revenue ?? 0),
        };
      });

      // Every product sold in the range, best-selling (by revenue) first.
      // Revenue is the item's price plus its modifiers, times quantity - before
      // order-level discounts, which aren't attributable to one item. Named
      // and categorised as the product is now, falling back to the name saved
      // on the sale.
      const modifierExtras = sql`coalesce((
        select sum(${orderItemModifiers.priceExtra}) from ${orderItemModifiers}
        where ${orderItemModifiers.orderItemId} = ${orderItems.id}
      ), 0)`;
      const productRevenue = sql<number>`sum((${orderItems.unitPrice} + ${modifierExtras}) * ${orderItems.quantity})`;
      const productRows = await db.select({
        productId: orderItems.productId,
        productName: sql<string>`coalesce(${products.name}, max(${orderItems.productName}))`,
        categoryName: categories.name,
        quantity: sql<number>`sum(${orderItems.quantity})`,
        revenue: productRevenue,
      }).from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(dateCondition)
        .groupBy(orderItems.productId)
        .orderBy(desc(productRevenue))
        .all();
      // Each product's ingredient cost (its own recipe plus the options
      // chosen on it) and profit before order discounts. costComplete is
      // false when part of it is unknown - no recipe, or an ingredient with
      // no cost - so the profit shown is too high.
      const modifierLinesByProduct = new Map<string, typeof sold.byModifier>();
      for (const line of sold.byModifier) {
        modifierLinesByProduct.set(line.productId, [...(modifierLinesByProduct.get(line.productId) ?? []), line]);
      }
      const uncostedIngredients = new Set<string>();
      let productsWithoutRecipe = 0;
      const topProducts = productRows.map((row) => {
        const modifierLines = modifierLinesByProduct.get(row.productId) ?? [];
        const cost = row.quantity * (unitCosts.productCost.get(row.productId) ?? 0)
          + modifierLines.reduce((sum, line) => sum + line.quantity * (unitCosts.modifierCost.get(line.modifierId) ?? 0), 0);
        const hasRecipe = unitCosts.productUncosted.has(row.productId);
        const missing = [
          ...(unitCosts.productUncosted.get(row.productId) ?? []),
          ...modifierLines.flatMap((line) => [...(unitCosts.modifierUncosted.get(line.modifierId) ?? [])]),
        ];
        missing.forEach((name) => uncostedIngredients.add(name));
        if (!hasRecipe) productsWithoutRecipe += 1;
        return {
          ...row,
          revenue: round2(row.revenue),
          cost: round2(cost),
          profit: round2(row.revenue - cost),
          costComplete: hasRecipe && missing.length === 0,
        };
      });

      res.json({
        dateRange: { startDate, endDate },
        metrics,
        previousPeriod: { startDate: previousStartDate, endDate: previousEndDate, metrics: previousMetrics },
        paymentBreakdown: paymentBreakdown.map((entry) => ({ ...entry, totalAmount: round2(entry.totalAmount) })),
        hourlyVolume,
        dailyVolume,
        topProducts,
        // Why profit may be too high: products sold that have no recipe, and
        // ingredients used with no cost entered.
        costCoverage: { productsWithoutRecipe, uncostedIngredients: [...uncostedIngredients].sort() },
      });
    } catch (error) {
      console.error('Daily summary report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // Bakong KHQR for Mobile Pay (src/lib/bakong.ts). Any logged-in register
  // can make a QR for a sale and ask whether it's been paid; the QR uses the
  // store's Bakong account from the POS settings.
  const sendBakongError = (res: express.Response, error: unknown, fallback: string) => {
    if (error instanceof BakongError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(fallback, error);
    return res.status(500).json({ error: fallback });
  };

  app.post('/api/payments/khqr', authenticate, validateBody(khqrRequestSchema), async (req, res) => {
    try {
      const { settings } = await loadPosSettings();
      if (!settings.bakong.accountId) {
        return res.status(409).json({ error: 'No Bakong account is set up for KHQR - add it in POS Settings' });
      }
      const { amount, currency } = req.body as { amount: number; currency: 'USD' | 'KHR' };
      res.json(generateKhqr(settings.bakong, amount, currency, settings.storeDetails.phones[0]));
    } catch (error) {
      sendBakongError(res, error, 'Failed to create the KHQR');
    }
  });

  app.get('/api/payments/khqr/:md5/status', authenticate, async (req, res) => {
    const md5 = String(req.params.md5);
    if (!/^[a-f0-9]{32}$/.test(md5)) {
      return res.status(400).json({ error: 'Invalid KHQR reference' });
    }
    try {
      res.json({ md5, status: await checkKhqrPaid(md5) });
    } catch (error) {
      sendBakongError(res, error, 'Failed to check the KHQR payment');
    }
  });

  // The email registered for the Bakong Open API - admins only. The token
  // issued to it is never sent out, only whether there is one.
  app.get('/api/settings/bakong-credential', authenticate, requireRole(['ADMIN']), async (_req, res) => {
    try {
      res.json(await credentialView());
    } catch (error) {
      sendBakongError(res, error, 'Failed to load the Bakong settings');
    }
  });

  app.put('/api/settings/bakong-credential', authenticate, requireRole(['ADMIN']), validateBody(bakongCredentialSchema), async (req, res) => {
    try {
      res.json(await setRegisteredEmail((req.body as { registeredEmail: string }).registeredEmail));
    } catch (error) {
      sendBakongError(res, error, 'Failed to save the Bakong settings');
    }
  });

  // The end-of-day report a register prints when closing: one day's sales
  // for the cashier asking (scope=mine, anyone) or the whole store
  // (scope=all, managers and admins). The cash section is the money that
  // should be in the drawer, per currency: what customers handed over less
  // the change given back, in USD and in riel as they physically moved -
  // the opening float isn't known here, so it's left to the cashier.
  app.get('/api/reports/end-of-day', authenticate, async (req, res) => {
    const date = (req.query.date as string) || storeTodayDateString();
    const scope = req.query.scope === 'all' ? 'all' : 'mine';
    if (!isDateString(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    if (scope === 'all' && !['MANAGER', 'ADMIN'].includes(req.user?.role ?? '')) {
      return res.status(403).json({ error: 'Only managers and admins can print the whole store\'s report' });
    }

    const localCreatedAt = sql`datetime(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`;
    const onDay = and(
      gte(localCreatedAt, `${date} 00:00:00`),
      lte(localCreatedAt, `${date} 23:59:59`),
      scope === 'mine' ? eq(orders.userId, req.user!.id) : undefined,
    );
    const completedOnDay = and(onDay, eq(orders.status, 'COMPLETED'));

    try {
      const [totals, voided, paymentRows, itemRows] = await Promise.all([
        db.select({
          orders: sql<number>`count(${orders.id})`,
          gross: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
          discounts: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`,
          tax: sql<number>`coalesce(sum(${orders.taxAmount}), 0)`,
          net: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
          firstSaleAt: sql<string | null>`min(${localCreatedAt})`,
          lastSaleAt: sql<string | null>`max(${localCreatedAt})`,
        }).from(orders).where(completedOnDay).get(),
        db.select({
          count: sql<number>`count(${orders.id})`,
          amount: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
        }).from(orders).where(and(onDay, eq(orders.status, 'VOIDED'))).get(),
        db.select({
          method: payments.paymentMethod,
          count: sql<number>`count(${payments.id})`,
          // Sale totals - what each method brought in.
          amount: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
          tenderedUsd: sql<number>`coalesce(sum(${payments.amountTenderedUsd}), 0)`,
          tenderedRiel: sql<number>`coalesce(sum(${payments.amountTenderedRiel}), 0)`,
          changeUsd: sql<number>`coalesce(sum(${payments.changeGivenUsd}), 0)`,
          changeRiel: sql<number>`coalesce(sum(${payments.changeGivenRiel}), 0)`,
        }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).where(completedOnDay).groupBy(payments.paymentMethod).all(),
        db.select({
          name: sql<string>`max(${orderItems.productName})`,
          quantity: sql<number>`sum(${orderItems.quantity})`,
          amount: sql<number>`sum((${orderItems.unitPrice} + coalesce((
            select sum(${orderItemModifiers.priceExtra}) from ${orderItemModifiers}
            where ${orderItemModifiers.orderItemId} = ${orderItems.id}
          ), 0)) * ${orderItems.quantity})`,
        }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).where(completedOnDay)
          .groupBy(orderItems.productId)
          .orderBy(desc(sql`sum(${orderItems.quantity})`))
          .all(),
      ]);

      const cash = paymentRows.find((row) => row.method === 'CASH');
      const cashierName = scope === 'mine'
        ? (await db.select({ name: users.name }).from(users).where(eq(users.id, req.user!.id)).get())?.name ?? null
        : null;

      res.json({
        date,
        scope,
        cashierName,
        firstSaleAt: totals?.firstSaleAt ?? null,
        lastSaleAt: totals?.lastSaleAt ?? null,
        orders: totals?.orders ?? 0,
        itemsSold: itemRows.reduce((sum, row) => sum + row.quantity, 0),
        voided: { count: voided?.count ?? 0, amount: round2(voided?.amount ?? 0) },
        sales: {
          gross: round2(totals?.gross ?? 0),
          discounts: round2(totals?.discounts ?? 0),
          tax: round2(totals?.tax ?? 0),
          net: round2(totals?.net ?? 0),
        },
        payments: paymentRows.map((row) => ({ method: row.method, count: row.count, amount: round2(row.amount) })),
        cash: {
          tenderedUsd: round2(cash?.tenderedUsd ?? 0),
          tenderedRiel: Math.round(cash?.tenderedRiel ?? 0),
          changeUsd: round2(cash?.changeUsd ?? 0),
          changeRiel: Math.round(cash?.changeRiel ?? 0),
          // In the drawer from today's cash sales, per currency.
          inDrawerUsd: round2((cash?.tenderedUsd ?? 0) - (cash?.changeUsd ?? 0)),
          inDrawerRiel: Math.round((cash?.tenderedRiel ?? 0) - (cash?.changeRiel ?? 0)),
        },
        items: itemRows.map((row) => ({ name: row.name, quantity: row.quantity, amount: round2(row.amount) })),
      });
    } catch (error) {
      console.error('End-of-day report error:', error);
      res.status(500).json({ error: 'Failed to generate the end-of-day report' });
    }
  });

  return app;
}

export { createApp };
