import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { eq, sql, gte, lte, and } from 'drizzle-orm';
import { db } from './db/index.js';
import {
  users, categories, products, modifierGroups, modifiers,
  inventoryItems, recipes, stockAdjustments, orders, orderItems,
  orderItemModifiers, payments,
} from './db/schema.js';
import { authenticate, hashPin, requireRole, signToken, verifyPin } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve __dirname under ESM NodeNext
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded product images statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================================================
// 1. AUTHENTICATION (STAFF PIN LOGIN)
// ============================================================================

/**
 * POST /api/auth/login
 * Fast numeric PIN authentication for POS cashiers & IMS managers
 */
app.post('/api/auth/login', async (req, res) => {
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

    const token = signToken({
      id: user.id,
      name: user.name,
      role: user.role,
    });

    res.json({
      token,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    user: req.user,
  });
});

app.post('/api/auth/logout', authenticate, (_req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

app.post('/api/auth/manager-approval', authenticate, requireRole(['MANAGER', 'ADMIN']), (req, res) => {
  const { action = 'general-approval', reason = 'Approved locally' } = req.body;

  res.json({
    success: true,
    approvedBy: req.user?.name,
    action,
    reason,
  });
});

// ============================================================================
// 2. CATALOG & MENU ENDPOINTS (POS + IMS)
// ============================================================================

/**
 * GET /api/categories
 * Returns menu categories ordered by sort preference
 */
app.get('/api/categories', async (req, res) => {
  try {
    const result = db.select().from(categories).orderBy(categories.sortOrder).all();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/products
 * Returns all active products with optional category filtering
 */
app.get('/api/products', async (req, res) => {
  const { categoryId } = req.query;

  try {
    let query = db.select().from(products).where(eq(products.isAvailable, true));
    
    if (categoryId && typeof categoryId === 'string') {
      query = db.select().from(products).where(
        and(eq(products.isAvailable, true), eq(products.categoryId, categoryId))
      );
    }

    const allProducts = query.all();
    res.json(allProducts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/products/:id/modifiers
 * Returns available modifier options (Milk, Syrups, Extra Shots) for a given product
 */
app.get('/api/products/:id/modifiers', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch all modifier groups and their individual choices
    const groups = db.select().from(modifierGroups).all();
    const result = groups.map((group) => {
      const options = db
        .select()
        .from(modifiers)
        .where(eq(modifiers.groupId, group.id))
        .all();
      return { ...group, options };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product modifiers' });
  }
});

// ============================================================================
// 3. POS TRANSACTIONS & INVENTORY DEDUCTION (CORE ENGINE)
// ============================================================================

/**
 * POST /api/orders
 * Atomic order processing: saves order, items, modifiers, payment,
 * and deducts stock automatically based on drink/modifier recipes.
 */
app.post('/api/orders', authenticate, async (req, res) => {
  const { items, paymentMethod, amountTendered, taxAmount = 0, discountAmount = 0 } = req.body;
  const actingUserId = req.user?.id;

  if (!actingUserId || !items || !items.length || !paymentMethod) {
    return res.status(400).json({ error: 'Invalid order payload' });
  }

  try {
    // Generate sequential order number for the current day
    const today = new Date().toISOString().split('T')[0];
    const todayOrdersCount = db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(gte(orders.createdAt, today))
      .get()?.count || 0;

    const orderNumber = todayOrdersCount + 1;
    const orderId = randomUUID();

    // Calculate subtotal and grand total
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

    // Execute order logic atomically inside a single SQLite transaction
    db.transaction(() => {
      // 1. Insert Master Order Record
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

      // 2. Insert Payment Record
      db.insert(payments).values({
        id: randomUUID(),
        orderId,
        paymentMethod,
        amountTendered: amountTendered || totalAmount,
        changeGiven: changeGiven > 0 ? changeGiven : 0,
      }).run();

      // 3. Process Line Items and Modifiers
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

        // 3a. Deduct Base Product Recipe Ingredients
        const baseRecipes = db
          .select()
          .from(recipes)
          .where(eq(recipes.productId, item.productId))
          .all();

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

        // 3b. Save Modifiers and Deduct Modifier Recipes (e.g., Oat Milk substitution)
        if (item.selectedModifiers && item.selectedModifiers.length) {
          for (const mod of item.selectedModifiers) {
            db.insert(orderItemModifiers).values({
              id: randomUUID(),
              orderItemId,
              modifierId: mod.id,
              modifierName: mod.name,
              priceExtra: mod.priceExtra,
            }).run();

            const modRecipes = db
              .select()
              .from(recipes)
              .where(eq(recipes.modifierId, mod.id))
              .all();

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

    res.status(201).json({
      success: true,
      orderId,
      orderNumber,
      subtotal,
      totalAmount,
      changeGiven,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to process sale' });
  }
});

// ============================================================================
// 4. INVENTORY MANAGEMENT SYSTEM (IMS ENDPOINTS)
// ============================================================================

/**
 * GET /api/inventory
 * Fetches current raw stock levels and flags items below their reorder threshold
 */
app.get('/api/inventory', async (req, res) => {
  try {
    const items = db.select().from(inventoryItems).all();
    const result = items.map((item) => ({
      ...item,
      isLowStock: item.stockQuantity <= item.reorderThreshold,
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory stock' });
  }
});

/**
 * POST /api/inventory/adjust
 * Manual stock adjustment endpoint (Restock, Spoilage, Audits)
 */
app.post('/api/inventory/adjust', authenticate, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
  const { inventoryItemId, quantityChanged, type, notes } = req.body;
  const actingUserId = req.user?.id;

  if (!inventoryItemId || !actingUserId || quantityChanged === undefined || !type) {
    return res.status(400).json({ error: 'Missing required adjustment parameters' });
  }

  try {
    db.transaction(() => {
      // Record adjustment log
      db.insert(stockAdjustments).values({
        id: randomUUID(),
        inventoryItemId,
        userId: actingUserId,
        quantityChanged,
        type,
        notes,
      }).run();

      // Apply changes to current inventory balance
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

// ============================================================================
// 5. MANAGER ANALYTICS & REPORTS (IMS)
// ============================================================================

/**
 * GET /api/reports/daily-summary
 * Provides sales metrics, revenue totals, and cash/card breakdowns for a date range
 */
app.get('/api/reports/daily-summary', async (req, res) => {
  const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
  const endDate = (req.query.endDate as string) || startDate;

  try {
    const summary = db
      .select({
        totalOrders: sql<number>`count(${orders.id})`,
        grossRevenue: sql<number>`sum(${orders.subtotal})`,
        totalTax: sql<number>`sum(${orders.taxAmount})`,
        totalDiscounts: sql<number>`sum(${orders.discountAmount})`,
        netRevenue: sql<number>`sum(${orders.totalAmount})`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, `${startDate} 00:00:00`),
          lte(orders.createdAt, `${endDate} 23:59:59`),
          eq(orders.status, 'COMPLETED')
        )
      )
      .get();

    const paymentBreakdown = db
      .select({
        method: payments.paymentMethod,
        totalAmount: sql<number>`sum(${payments.amountTendered} - ${payments.changeGiven})`,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          gte(orders.createdAt, `${startDate} 00:00:00`),
          lte(orders.createdAt, `${endDate} 23:59:59`),
          eq(orders.status, 'COMPLETED')
        )
      )
      .groupBy(payments.paymentMethod)
      .all();

    res.json({
      dateRange: { startDate, endDate },
      metrics: summary || { totalOrders: 0, grossRevenue: 0, totalTax: 0, totalDiscounts: 0, netRevenue: 0 },
      paymentBreakdown,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// SERVER START
// ============================================================================

app.listen(PORT, () => {
  console.log(`☕ Cafe POS Backend API running at http://localhost:${PORT}`);
});