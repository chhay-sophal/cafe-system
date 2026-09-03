import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { eq, sql, gte, lte, and, inArray, isNotNull, desc } from 'drizzle-orm';
import { db } from './db/index.js';
import {
  users, categories, products, modifierGroups, modifiers, productModifiers,
  inventoryItems, recipes, stockAdjustments, orders, orderItems,
  orderItemModifiers, payments, storeSettings,
} from './db/schema.js';
import { authenticate, hashPin, requireRole, signToken, verifyPin } from './middleware/auth.js';
import { validateBody } from './middleware/validate.js';
import { productImageUpload, saveProductImage } from './lib/uploads.js';
import {
  categorySchema,
  exchangeRateSchema,
  inventoryAdjustmentSchema,
  inventoryItemSchema,
  mainCurrencySchema,
  managerApprovalSchema,
  orderSchema,
  pinLoginSchema,
  productSchema,
  recipeUpdateSchema,
  taxSettingSchema,
  userCreateSchema,
  userUpdateSchema,
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

// The store's current local calendar date (YYYY-MM-DD), used as the default
// "today" for date-range filters and the daily order-number counter.
function storeTodayDateString(): string {
  const shifted = new Date(Date.now() + STORE_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

async function getStoreSettings(): Promise<{ exchangeRateRielPerUsd: number; mainCurrency: 'USD' | 'KHR'; taxEnabled: boolean }> {
  const row = await db.select().from(storeSettings).where(eq(storeSettings.id, 'default')).get();
  return {
    exchangeRateRielPerUsd: row?.exchangeRateRielPerUsd ?? DEFAULT_EXCHANGE_RATE_RIEL_PER_USD,
    mainCurrency: row?.mainCurrency ?? DEFAULT_MAIN_CURRENCY,
    taxEnabled: row?.taxEnabled ?? DEFAULT_TAX_ENABLED,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Riel has no sub-unit in everyday use, so amounts are rounded to the
// nearest 100 - the smallest note in common circulation.
function usdToRiel(usdValue: number, exchangeRate: number): number {
  return Math.round((usdValue * exchangeRate) / 100) * 100;
}

// Splits a USD change amount into whole dollars (returned as USD notes) plus
// the sub-dollar remainder converted to Riel - used only when the customer
// paid in pure USD (see computeChange).
function splitChange(changeDueUsd: number, exchangeRate: number): { usd: number; riel: number } {
  const wholeUsd = Math.floor(changeDueUsd);
  const remainderUsd = round2(changeDueUsd - wholeUsd);
  return { usd: wholeUsd, riel: usdToRiel(remainderUsd, exchangeRate) };
}

// Change currency follows how the customer paid: pure USD tender gets change
// as whole USD notes plus a Riel remainder (the standard Cambodian cashier
// split); paying in pure Riel, or a mix of both, gets change entirely in
// Riel - handing back a few cents of USD on top of Riel change isn't
// practical, and simplifies the mixed-tender case to a single currency.
function computeChange(
  changeDueUsd: number,
  exchangeRate: number,
  amountTenderedUsd: number,
  amountTenderedRiel: number,
): { usd: number; riel: number } {
  const isPureUsdTender = amountTenderedUsd > 0 && amountTenderedRiel === 0;
  if (isPureUsdTender) {
    return splitChange(changeDueUsd, exchangeRate);
  }
  return { usd: 0, riel: usdToRiel(changeDueUsd, exchangeRate) };
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

  app.get('/api/categories', async (_req, res) => {
    try {
      const result = await db.select().from(categories).orderBy(categories.sortOrder).all();
      res.json(result);
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

  app.put('/api/categories/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(categorySchema), async (req, res) => {
    const id = String(req.params.id);
    const { name, sortOrder } = req.body;

    try {
      const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
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
      const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Category not found' });
      }

      const productsInCategory = await db.select().from(products).where(eq(products.categoryId, id)).all();

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

        const targetCategory = await db.select().from(categories).where(eq(categories.id, reassignToCategoryId)).get();
        if (!targetCategory) {
          return res.status(404).json({ error: 'Target category not found' });
        }
      }

      await db.transaction(async (tx) => {
        if (productsInCategory.length > 0 && reassignToCategoryId) {
          await tx.update(products).set({ categoryId: reassignToCategoryId }).where(eq(products.categoryId, id)).run();
        }

        await tx.delete(categories).where(eq(categories.id, id)).run();

        // Recalculate sortOrder for the remaining categories so there's no
        // gap left by the deleted one - keeps their relative order, just
        // compacted (e.g. 0,1,2,3 minus #1 becomes 0,1,2, not 0,2,3).
        const remaining = await tx.select().from(categories).orderBy(categories.sortOrder).all();
        for (const [index, category] of remaining.entries()) {
          if (category.sortOrder !== index) {
            await tx.update(categories).set({ sortOrder: index }).where(eq(categories.id, category.id)).run();
          }
        }
      });

      res.json({ success: true, reassignedCount: productsInCategory.length });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  });

  app.get('/api/products', async (req, res) => {
    const { categoryId } = req.query;

    try {
      const query = categoryId && typeof categoryId === 'string'
        ? db.select().from(products).where(eq(products.categoryId, categoryId))
        : db.select().from(products);

      res.json(await query.all());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.post('/api/products', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(productSchema), async (req, res) => {
    const { categoryId, name, basePrice, sku, imageUrl, isAvailable } = req.body;

    try {
      const categoryExists = await db.select().from(categories).where(eq(categories.id, categoryId)).get();
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
      const existing = await db.select().from(products).where(eq(products.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const categoryExists = await db.select().from(categories).where(eq(categories.id, categoryId)).get();
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
      const existing = await db.select().from(products).where(eq(products.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const historicalOrderItems = await db.select().from(orderItems).where(eq(orderItems.productId, id)).all();
      if (historicalOrderItems.length > 0) {
        return res.status(409).json({
          error: `"${existing.name}" has ${historicalOrderItems.length} historical order line(s) and cannot be deleted.`,
        });
      }

      await db.transaction(async (tx) => {
        await tx.delete(recipes).where(eq(recipes.productId, id)).run();
        await tx.delete(productModifiers).where(eq(productModifiers.productId, id)).run();
        await tx.delete(products).where(eq(products.id, id)).run();
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

      const groups = await db.select().from(modifierGroups).where(inArray(modifierGroups.id, groupIds)).all();
      const result = await Promise.all(groups.map(async (group) => {
        const options = await db.select().from(modifiers).where(eq(modifiers.groupId, group.id)).all();
        return { ...group, options };
      }));

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch product modifiers' });
    }
  });

  app.get('/api/modifiers', async (_req, res) => {
    try {
      const groups = await db.select().from(modifierGroups).all();
      const result = await Promise.all(groups.map(async (group) => {
        const options = await db.select().from(modifiers).where(eq(modifiers.groupId, group.id)).all();
        return { ...group, options };
      }));

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch modifiers' });
    }
  });

  app.post('/api/orders', authenticate, validateBody(orderSchema), async (req, res) => {
    const {
      items, paymentMethod, amountTenderedUsd = 0, amountTenderedRiel = 0, taxAmount: requestedTaxAmount = 0, discountAmount = 0,
    } = req.body;
    const actingUserId = req.user?.id;

    if (!actingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const today = storeTodayDateString();
      const todayOrdersCount = (await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(gte(sql`datetime(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`, today))
        .get())?.count || 0;
      const orderNumber = todayOrdersCount + 1;
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

      const { exchangeRateRielPerUsd: exchangeRate, taxEnabled } = await getStoreSettings();
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
        if (round2(tenderedTotalUsd) < round2(totalAmount)) {
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
    const dateCondition = and(
      gte(localCreatedAt, `${startDate} 00:00:00`),
      lte(localCreatedAt, `${endDate} 23:59:59`),
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
      })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(payments, eq(payments.orderId, orders.id))
        .where(dateCondition)
        .orderBy(desc(orders.createdAt))
        .all();

      res.json(rows);
    } catch (error) {
      console.error('Fetch orders error:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  app.get('/api/orders/:id', authenticate, async (req, res) => {
    const id = String(req.params.id);
    const localCreatedAt = sql`datetime(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`;

    try {
      const order = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: localCreatedAt,
        status: orders.status,
        subtotal: orders.subtotal,
        taxAmount: orders.taxAmount,
        discountAmount: orders.discountAmount,
        totalAmount: orders.totalAmount,
        cashierName: users.name,
      })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(eq(orders.id, id))
        .get();

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const items = await db.select({
        id: orderItems.id,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
      }).from(orderItems).where(eq(orderItems.orderId, id)).all();

      const itemModifiers = await db.select({
        orderItemId: orderItemModifiers.orderItemId,
        modifierName: orderItemModifiers.modifierName,
        priceExtra: orderItemModifiers.priceExtra,
      })
        .from(orderItemModifiers)
        .innerJoin(orderItems, eq(orderItemModifiers.orderItemId, orderItems.id))
        .where(eq(orderItems.orderId, id))
        .all();

      const itemsWithModifiers = items.map((item) => ({
        ...item,
        modifiers: itemModifiers
          .filter((m) => m.orderItemId === item.id)
          .map(({ modifierName, priceExtra }) => ({ modifierName, priceExtra })),
      }));

      const payment = await db.select({
        paymentMethod: payments.paymentMethod,
        amountTenderedUsd: payments.amountTenderedUsd,
        amountTenderedRiel: payments.amountTenderedRiel,
        changeGivenUsd: payments.changeGivenUsd,
        changeGivenRiel: payments.changeGivenRiel,
        exchangeRateRielPerUsd: payments.exchangeRateRielPerUsd,
      }).from(payments).where(eq(payments.orderId, id)).get();

      res.json({ ...order, items: itemsWithModifiers, payment: payment ?? null });
    } catch (error) {
      console.error('Fetch order detail error:', error);
      res.status(500).json({ error: 'Failed to fetch order detail' });
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

  app.get('/api/inventory', async (_req, res) => {
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

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update stock adjustment' });
    }
  });

  app.get('/api/recipes/summary', async (_req, res) => {
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

  app.get('/api/recipes', async (req, res) => {
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

  app.get('/api/reports/daily-summary', async (req, res) => {
    const startDate = (req.query.startDate as string) || storeTodayDateString();
    const endDate = (req.query.endDate as string) || startDate;
    // startDate/endDate are store-local calendar days (see storeTodayDateString),
    // but createdAt is stored in UTC - shift it to local time before comparing,
    // otherwise the boundary is off by the store's UTC offset.
    const localCreatedAt = sql`datetime(${orders.createdAt}, ${STORE_UTC_OFFSET_SQL_MODIFIER})`;
    const dateCondition = and(
      gte(localCreatedAt, `${startDate} 00:00:00`),
      lte(localCreatedAt, `${endDate} 23:59:59`),
      eq(orders.status, 'COMPLETED'),
    );

    try {
      // SUM() over zero matching rows returns NULL, not 0 - coalesce so an
      // empty date range reports clean zeros instead of nulls the frontend
      // would have to guard against.
      const summary = await db.select({
        totalOrders: sql<number>`count(${orders.id})`,
        grossRevenue: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
        totalTax: sql<number>`coalesce(sum(${orders.taxAmount}), 0)`,
        totalDiscounts: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`,
        netRevenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
      }).from(orders).where(dateCondition).get();

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
        revenue: hourlyByHour.get(hour)?.revenue ?? 0,
      }));

      res.json({
        dateRange: { startDate, endDate },
        metrics: summary || { totalOrders: 0, grossRevenue: 0, totalTax: 0, totalDiscounts: 0, netRevenue: 0 },
        paymentBreakdown,
        hourlyVolume,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  return app;
}

export { createApp };
