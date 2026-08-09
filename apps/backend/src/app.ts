import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'crypto';
import { eq, sql, gte, lte, and } from 'drizzle-orm';
import { db } from './db/index.js';
import {
  users, categories, products, modifierGroups, modifiers,
  inventoryItems, recipes, stockAdjustments, orders, orderItems,
  orderItemModifiers, payments,
} from './db/schema.js';
import { authenticate, hashPin, requireRole, signToken, verifyPin } from './middleware/auth.js';
import { validateBody } from './middleware/validate.js';
import {
  inventoryAdjustmentSchema,
  managerApprovalSchema,
  orderSchema,
  pinLoginSchema,
} from './shared-schemas.js';

function createApp() {
  const app = express();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  app.post('/api/auth/login', validateBody(pinLoginSchema), async (req, res) => {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    try {
      const normalizedPin = String(pin).trim();
      const candidates = db.select().from(users).all();
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
        db.update(users)
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

  app.get('/api/categories', async (_req, res) => {
    try {
      const result = db.select().from(categories).orderBy(categories.sortOrder).all();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  app.get('/api/products', async (req, res) => {
    const { categoryId } = req.query;

    try {
      let query = db.select().from(products).where(eq(products.isAvailable, true));

      if (categoryId && typeof categoryId === 'string') {
        query = db.select().from(products).where(and(eq(products.isAvailable, true), eq(products.categoryId, categoryId)));
      }

      res.json(query.all());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.get('/api/products/:id/modifiers', async (_req, res) => {
    try {
      const groups = db.select().from(modifierGroups).all();
      const result = groups.map((group) => {
        const options = db.select().from(modifiers).where(eq(modifiers.groupId, group.id)).all();
        return { ...group, options };
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch product modifiers' });
    }
  });

  app.post('/api/orders', authenticate, validateBody(orderSchema), async (req, res) => {
    const { items, paymentMethod, amountTendered = 0, taxAmount = 0, discountAmount = 0 } = req.body;
    const actingUserId = req.user?.id;

    if (!actingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const todayOrdersCount = db.select({ count: sql<number>`count(*)` }).from(orders).where(gte(orders.createdAt, today)).get()?.count || 0;
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

      const totalAmount = subtotal + taxAmount - discountAmount;
      const changeGiven = paymentMethod === 'CASH' ? (amountTendered - totalAmount) : 0;

      db.transaction(() => {
        db.insert(orders).values({
          id: orderId,
          userId: actingUserId,
          orderNumber,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          status: 'COMPLETED',
        }).run();

        db.insert(payments).values({
          id: randomUUID(),
          orderId,
          paymentMethod,
          amountTendered: amountTendered || totalAmount,
          changeGiven: changeGiven > 0 ? changeGiven : 0,
        }).run();

        for (const item of items) {
          const orderItemId = randomUUID();

          db.insert(orderItems).values({
            id: orderItemId,
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
          }).run();

          const baseRecipes = db.select().from(recipes).where(eq(recipes.productId, item.productId)).all();
          for (const recipe of baseRecipes) {
            const totalDeduction = recipe.quantityRequired * item.quantity;
            db.update(inventoryItems)
              .set({
                stockQuantity: sql`${inventoryItems.stockQuantity} - ${totalDeduction}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(inventoryItems.id, recipe.inventoryItemId))
              .run();
          }

          if (item.selectedModifiers && item.selectedModifiers.length) {
            for (const mod of item.selectedModifiers) {
              db.insert(orderItemModifiers).values({
                id: randomUUID(),
                orderItemId,
                modifierId: mod.id,
                modifierName: mod.name,
                priceExtra: mod.priceExtra,
              }).run();

              const modRecipes = db.select().from(recipes).where(eq(recipes.modifierId, mod.id)).all();
              for (const recipe of modRecipes) {
                const totalDeduction = recipe.quantityRequired * item.quantity;
                db.update(inventoryItems)
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

      res.status(201).json({ success: true, orderId, orderNumber, subtotal, totalAmount, changeGiven });
    } catch (error) {
      console.error('Order creation error:', error);
      res.status(500).json({ error: 'Failed to process sale' });
    }
  });

  app.get('/api/inventory', async (_req, res) => {
    try {
      const items = db.select().from(inventoryItems).all();
      const result = items.map((item) => ({ ...item, isLowStock: item.stockQuantity <= item.reorderThreshold }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inventory stock' });
    }
  });

  app.post('/api/inventory/adjust', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(inventoryAdjustmentSchema), async (req, res) => {
    const { inventoryItemId, quantityChanged, type, notes } = req.body;
    const actingUserId = req.user?.id;

    if (!inventoryItemId || !actingUserId || quantityChanged === undefined || !type) {
      return res.status(400).json({ error: 'Missing required adjustment parameters' });
    }

    try {
      db.transaction(() => {
        db.insert(stockAdjustments).values({
          id: randomUUID(),
          inventoryItemId,
          userId: actingUserId,
          quantityChanged,
          type,
          notes,
        }).run();

        db.update(inventoryItems)
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

  app.get('/api/reports/daily-summary', async (req, res) => {
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || startDate;

    try {
      const summary = db.select({
        totalOrders: sql<number>`count(${orders.id})`,
        grossRevenue: sql<number>`sum(${orders.subtotal})`,
        totalTax: sql<number>`sum(${orders.taxAmount})`,
        totalDiscounts: sql<number>`sum(${orders.discountAmount})`,
        netRevenue: sql<number>`sum(${orders.totalAmount})`,
      }).from(orders).where(and(gte(orders.createdAt, `${startDate} 00:00:00`), lte(orders.createdAt, `${endDate} 23:59:59`), eq(orders.status, 'COMPLETED'))).get();

      const paymentBreakdown = db.select({
        method: payments.paymentMethod,
        totalAmount: sql<number>`sum(${payments.amountTendered} - ${payments.changeGiven})`,
      }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).where(and(gte(orders.createdAt, `${startDate} 00:00:00`), lte(orders.createdAt, `${endDate} 23:59:59`), eq(orders.status, 'COMPLETED'))).groupBy(payments.paymentMethod).all();

      res.json({
        dateRange: { startDate, endDate },
        metrics: summary || { totalOrders: 0, grossRevenue: 0, totalTax: 0, totalDiscounts: 0, netRevenue: 0 },
        paymentBreakdown,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  return app;
}

const app = createApp();

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT ?? 3000);
  app.listen(PORT, () => {
    console.log(`☕ Cafe POS Backend API running at http://localhost:${PORT}`);
  });
}

export { app, createApp };
