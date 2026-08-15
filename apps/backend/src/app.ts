import express from 'express';
import cors from 'cors';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'crypto';
import { eq, sql, gte, lte, and, inArray, isNotNull } from 'drizzle-orm';
import { db } from './db/index.js';
import {
  users, categories, products, modifierGroups, modifiers, productModifiers,
  inventoryItems, recipes, stockAdjustments, orders, orderItems,
  orderItemModifiers, payments,
} from './db/schema.js';
import { authenticate, hashPin, requireRole, signToken, verifyPin } from './middleware/auth.js';
import { validateBody } from './middleware/validate.js';
import {
  categorySchema,
  inventoryAdjustmentSchema,
  inventoryItemSchema,
  managerApprovalSchema,
  orderSchema,
  pinLoginSchema,
  productSchema,
  recipeUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from './shared-schemas.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

  const productImageUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(__dirname, '../uploads/products');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        cb(new Error('Only JPEG, PNG, and WEBP images are allowed'));
        return;
      }
      cb(null, true);
    },
  });

  app.post('/api/upload', authenticate, requireRole(['MANAGER', 'ADMIN']), (req, res) => {
    productImageUpload.single('image')(req, res, (error: unknown) => {
      if (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to upload image' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }
      res.status(201).json({ url: `/uploads/products/${req.file.filename}` });
    });
  });

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

  app.get('/api/users', authenticate, requireRole(['ADMIN']), async (_req, res) => {
    try {
      const result = db.select(USER_PUBLIC_COLUMNS).from(users).all();
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
      db.insert(users).values({ id, name, pinHash, role, isActive }).run();

      const created = db.select(USER_PUBLIC_COLUMNS).from(users).where(eq(users.id, id)).get();
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
      const existing = db.select().from(users).where(eq(users.id, id)).get();
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

      db.update(users).set(updates).where(eq(users.id, id)).run();

      const updated = db.select(USER_PUBLIC_COLUMNS).from(users).where(eq(users.id, id)).get();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  app.get('/api/categories', async (_req, res) => {
    try {
      const result = db.select().from(categories).orderBy(categories.sortOrder).all();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  app.post('/api/categories', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(categorySchema), async (req, res) => {
    const { name, sortOrder } = req.body;

    try {
      const id = randomUUID();
      db.insert(categories).values({ id, name, sortOrder }).run();

      const created = db.select().from(categories).where(eq(categories.id, id)).get();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create category' });
    }
  });

  app.put('/api/categories/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(categorySchema), async (req, res) => {
    const id = String(req.params.id);
    const { name, sortOrder } = req.body;

    try {
      const existing = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Category not found' });
      }

      db.update(categories).set({ name, sortOrder }).where(eq(categories.id, id)).run();

      const updated = db.select().from(categories).where(eq(categories.id, id)).get();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update category' });
    }
  });

  app.get('/api/products', async (req, res) => {
    const { categoryId } = req.query;

    try {
      const query = categoryId && typeof categoryId === 'string'
        ? db.select().from(products).where(eq(products.categoryId, categoryId))
        : db.select().from(products);

      res.json(query.all());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.post('/api/products', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(productSchema), async (req, res) => {
    const { categoryId, name, basePrice, sku, imageUrl, isAvailable } = req.body;

    try {
      const categoryExists = db.select().from(categories).where(eq(categories.id, categoryId)).get();
      if (!categoryExists) {
        return res.status(400).json({ error: 'Selected category does not exist' });
      }

      const id = randomUUID();
      db.insert(products).values({
        id,
        categoryId,
        name,
        basePrice,
        sku: sku || null,
        imageUrl: imageUrl || null,
        isAvailable,
      }).run();

      const created = db.select().from(products).where(eq(products.id, id)).get();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.put('/api/products/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(productSchema), async (req, res) => {
    const id = String(req.params.id);
    const { categoryId, name, basePrice, sku, imageUrl, isAvailable } = req.body;

    try {
      const existing = db.select().from(products).where(eq(products.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const categoryExists = db.select().from(categories).where(eq(categories.id, categoryId)).get();
      if (!categoryExists) {
        return res.status(400).json({ error: 'Selected category does not exist' });
      }

      db.update(products).set({
        categoryId,
        name,
        basePrice,
        sku: sku || null,
        imageUrl: imageUrl || null,
        isAvailable,
      }).where(eq(products.id, id)).run();

      const updated = db.select().from(products).where(eq(products.id, id)).get();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const id = String(req.params.id);

    try {
      const existing = db.select().from(products).where(eq(products.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const historicalOrderItems = db.select().from(orderItems).where(eq(orderItems.productId, id)).all();
      if (historicalOrderItems.length > 0) {
        return res.status(409).json({
          error: `"${existing.name}" has ${historicalOrderItems.length} historical order line(s) and cannot be deleted.`,
        });
      }

      db.transaction(() => {
        db.delete(recipes).where(eq(recipes.productId, id)).run();
        db.delete(productModifiers).where(eq(productModifiers.productId, id)).run();
        db.delete(products).where(eq(products.id, id)).run();
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  app.get('/api/products/:id/modifiers', async (req, res) => {
    const { id } = req.params;

    try {
      const links = db.select().from(productModifiers).where(eq(productModifiers.productId, id)).all();
      const groupIds = links.map((link) => link.groupId);

      if (groupIds.length === 0) {
        return res.json([]);
      }

      const groups = db.select().from(modifierGroups).where(inArray(modifierGroups.id, groupIds)).all();
      const result = groups.map((group) => {
        const options = db.select().from(modifiers).where(eq(modifiers.groupId, group.id)).all();
        return { ...group, options };
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch product modifiers' });
    }
  });

  app.get('/api/modifiers', async (_req, res) => {
    try {
      const groups = db.select().from(modifierGroups).all();
      const result = groups.map((group) => {
        const options = db.select().from(modifiers).where(eq(modifiers.groupId, group.id)).all();
        return { ...group, options };
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch modifiers' });
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

  app.post('/api/inventory', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(inventoryItemSchema), async (req, res) => {
    const { name, unit, reorderThreshold, costPerUnit } = req.body;

    try {
      const id = randomUUID();
      db.insert(inventoryItems).values({ id, name, unit, reorderThreshold, costPerUnit, stockQuantity: 0 }).run();

      const created = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get()!;
      res.status(201).json({ ...created, isLowStock: created.stockQuantity <= created.reorderThreshold });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create inventory item' });
    }
  });

  app.put('/api/inventory/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), validateBody(inventoryItemSchema), async (req, res) => {
    const id = String(req.params.id);
    const { name, unit, reorderThreshold, costPerUnit } = req.body;

    try {
      const existing = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }

      db.update(inventoryItems)
        .set({ name, unit, reorderThreshold, costPerUnit, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(inventoryItems.id, id))
        .run();

      const updated = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get()!;
      res.json({ ...updated, isLowStock: updated.stockQuantity <= updated.reorderThreshold });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update inventory item' });
    }
  });

  app.delete('/api/inventory/:id', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const id = String(req.params.id);

    try {
      const existing = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }

      const linkedRecipes = db.select().from(recipes).where(eq(recipes.inventoryItemId, id)).all();
      if (linkedRecipes.length > 0) {
        return res.status(409).json({
          error: `"${existing.name}" is used in ${linkedRecipes.length} recipe(s). Remove the recipe link(s) before deleting this item.`,
        });
      }

      db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run();
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

  app.get('/api/recipes/summary', async (_req, res) => {
    try {
      const productCounts = db.select({
        id: recipes.productId,
        ingredientCount: sql<number>`count(*)`,
      }).from(recipes).where(isNotNull(recipes.productId)).groupBy(recipes.productId).all();

      const modifierCounts = db.select({
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
      const existing = db.select().from(products).where(eq(products.id, productId)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      db.delete(recipes).where(eq(recipes.productId, productId)).run();
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

      const rows = db.select({
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
      db.transaction(() => {
        const condition = productId
          ? eq(recipes.productId, productId)
          : eq(recipes.modifierId, modifierId);

        db.delete(recipes).where(condition).run();

        for (const ingredient of ingredients) {
          db.insert(recipes).values({
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
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || startDate;
    const dateCondition = and(
      gte(orders.createdAt, `${startDate} 00:00:00`),
      lte(orders.createdAt, `${endDate} 23:59:59`),
      eq(orders.status, 'COMPLETED'),
    );

    try {
      // SUM() over zero matching rows returns NULL, not 0 - coalesce so an
      // empty date range reports clean zeros instead of nulls the frontend
      // would have to guard against.
      const summary = db.select({
        totalOrders: sql<number>`count(${orders.id})`,
        grossRevenue: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
        totalTax: sql<number>`coalesce(sum(${orders.taxAmount}), 0)`,
        totalDiscounts: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`,
        netRevenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
      }).from(orders).where(dateCondition).get();

      const paymentBreakdown = db.select({
        method: payments.paymentMethod,
        totalAmount: sql<number>`sum(${payments.amountTendered} - ${payments.changeGiven})`,
      }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).where(dateCondition).groupBy(payments.paymentMethod).all();

      const hourlyRows = db.select({
        hour: sql<string>`strftime('%H', ${orders.createdAt})`,
        orderCount: sql<number>`count(${orders.id})`,
        revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
      }).from(orders).where(dateCondition).groupBy(sql`strftime('%H', ${orders.createdAt})`).all();

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

const app = createApp();

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT ?? 3000);
  app.listen(PORT, () => {
    console.log(`☕ Cafe POS Backend API running at http://localhost:${PORT}`);
  });
}

export { app, createApp };
