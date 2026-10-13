import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from './app.js';
import { db } from './db/index.js';
import {
  categories, inventoryItems, modifierGroups, modifiers, orderItemModifiers, orderItems, orders, payments, productModifiers, products, recipes,
  stockAdjustments, storeSettings, users,
} from './db/schema.js';
import { hashPin, signToken } from './middleware/auth.js';
import { env } from './env.js';
import { TEST_DATABASE_URL } from '../test/test-database.js';

// The suites below delete orders, users etc. - refuse to run against anything
// but the throwaway test database (e.g. if run outside vitest.config.ts).
if (env.TURSO_DATABASE_URL !== TEST_DATABASE_URL) {
  throw new Error(`Refusing to run: tests must use ${TEST_DATABASE_URL}, not ${env.TURSO_DATABASE_URL}`);
}

const app = createApp();

describe('backend auth and validation', () => {
  beforeEach(async () => {
    // The test database is shared across suites within a run, so users must
    // be cleared in FK-dependency order - any leftover orders
    // or stock adjustments referencing a user otherwise abort the delete
    // with a foreign key constraint failure.
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  it('returns 400 for invalid login payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  it('logs in a cashier with a valid PIN', async () => {
    const pinHash = await hashPin('1234');
    await db.insert(users).values({
      id: 'cashier-1',
      name: 'Test Cashier',
      pinHash,
      role: 'CASHIER',
      isActive: true,
    }).run();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ pin: '1234' });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('CASHIER');
    expect(response.body.token).toBeTypeOf('string');
  });
});

describe('exchange rate settings', () => {
  beforeEach(async () => {
    await db.delete(storeSettings).run();
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  it('returns the first-setup defaults (KHR, tax off, 4100 riel/usd) when none has been set', async () => {
    const response = await request(app).get('/api/settings/exchange-rate');

    expect(response.status).toBe(200);
    expect(response.body.exchangeRateRielPerUsd).toBe(4100);
    expect(response.body.mainCurrency).toBe('KHR');
    expect(response.body.taxEnabled).toBe(false);
  });

  it('rejects a rate update from a non-admin', async () => {
    const pinHash = await hashPin('1234');
    await db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    const token = signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });

    const response = await request(app)
      .put('/api/settings/exchange-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ exchangeRateRielPerUsd: 4200 });

    expect(response.status).toBe(403);
  });

  it('lets an admin update the rate, reflected by later reads', async () => {
    const pinHash = await hashPin('9999');
    await db.insert(users).values({ id: 'admin-1', name: 'Admin', pinHash, role: 'ADMIN', isActive: true }).run();
    const token = signToken({ id: 'admin-1', name: 'Admin', role: 'ADMIN' });

    const putResponse = await request(app)
      .put('/api/settings/exchange-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ exchangeRateRielPerUsd: 4000 });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.exchangeRateRielPerUsd).toBe(4000);

    const getResponse = await request(app).get('/api/settings/exchange-rate');
    expect(getResponse.body.exchangeRateRielPerUsd).toBe(4000);
  });

  it('rejects a main currency update from a non-admin', async () => {
    const pinHash = await hashPin('1234');
    await db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    const token = signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });

    const response = await request(app)
      .put('/api/settings/main-currency')
      .set('Authorization', `Bearer ${token}`)
      .send({ mainCurrency: 'KHR' });

    expect(response.status).toBe(403);
  });

  it('lets an admin switch the main currency to KHR, reflected by later reads', async () => {
    const pinHash = await hashPin('9999');
    await db.insert(users).values({ id: 'admin-1', name: 'Admin', pinHash, role: 'ADMIN', isActive: true }).run();
    const token = signToken({ id: 'admin-1', name: 'Admin', role: 'ADMIN' });

    const putResponse = await request(app)
      .put('/api/settings/main-currency')
      .set('Authorization', `Bearer ${token}`)
      .send({ mainCurrency: 'KHR' });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.mainCurrency).toBe('KHR');

    const getResponse = await request(app).get('/api/settings/exchange-rate');
    expect(getResponse.body.mainCurrency).toBe('KHR');
    // Switching main currency doesn't touch the exchange rate.
    expect(getResponse.body.exchangeRateRielPerUsd).toBe(4100);
  });

  it('rejects an invalid main currency value', async () => {
    const pinHash = await hashPin('9999');
    await db.insert(users).values({ id: 'admin-1', name: 'Admin', pinHash, role: 'ADMIN', isActive: true }).run();
    const token = signToken({ id: 'admin-1', name: 'Admin', role: 'ADMIN' });

    const response = await request(app)
      .put('/api/settings/main-currency')
      .set('Authorization', `Bearer ${token}`)
      .send({ mainCurrency: 'EUR' });

    expect(response.status).toBe(400);
  });

  it('rejects a tax setting update from a non-admin', async () => {
    const pinHash = await hashPin('1234');
    await db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    const token = signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });

    const response = await request(app)
      .put('/api/settings/tax')
      .set('Authorization', `Bearer ${token}`)
      .send({ taxEnabled: false });

    expect(response.status).toBe(403);
  });

  it('lets an admin disable tax, reflected by later reads', async () => {
    const pinHash = await hashPin('9999');
    await db.insert(users).values({ id: 'admin-1', name: 'Admin', pinHash, role: 'ADMIN', isActive: true }).run();
    const token = signToken({ id: 'admin-1', name: 'Admin', role: 'ADMIN' });

    const putResponse = await request(app)
      .put('/api/settings/tax')
      .set('Authorization', `Bearer ${token}`)
      .send({ taxEnabled: false });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.taxEnabled).toBe(false);

    const getResponse = await request(app).get('/api/settings/exchange-rate');
    expect(getResponse.body.taxEnabled).toBe(false);
  });
});

describe('order payments in mixed USD/Riel', () => {
  beforeEach(async () => {
    await db.delete(storeSettings).run();
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  async function cashierToken() {
    const pinHash = await hashPin('1234');
    await db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    return signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });
  }

  // orderItems.productId is a real FK - reuse a seeded product rather than
  // touching the categories/products tables (recipes still reference the
  // seeded catalog, so wiping it here would break unrelated FKs).
  async function testProductId(): Promise<string> {
    const existing = await db.select({ id: products.id }).from(products).limit(1).get();
    if (existing) {
      return existing.id;
    }

    const categoryId = randomUUID();
    const productId = randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'Test Category' }).run();
    await db.insert(products).values({ id: productId, categoryId, name: 'Test Product', basePrice: 3.25 }).run();
    return productId;
  }

  it('ignores a client-supplied taxAmount once tax is disabled', async () => {
    await db.insert(storeSettings).values({ id: 'default', taxEnabled: false }).run();
    const token = await cashierToken();

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: await testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 5,
        amountTenderedRiel: 0,
        taxAmount: 1, // a stale/misbehaving client still sending tax - should be ignored
      });

    expect(response.status).toBe(201);
    expect(response.body.subtotal).toBe(3.25);
    expect(response.body.totalAmount).toBe(3.25);

    const savedOrder = await db.select().from(orders).where(eq(orders.id, response.body.orderId)).get();
    expect(savedOrder?.taxAmount).toBe(0);
  });

  it('gives change for a pure-USD tender as whole dollars plus a Riel remainder', async () => {
    const token = await cashierToken();

    // total = 3.25, tendered $5 cash -> change $1.75 -> $1 + (0.75 * 4100 default rate) rounded to nearest 100 = 3100 riel
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: await testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 5,
        amountTenderedRiel: 0,
      });

    expect(response.status).toBe(201);
    expect(response.body.changeGivenUsd).toBe(1);
    expect(response.body.changeGivenRiel).toBe(3100);
    expect(response.body.exchangeRateRielPerUsd).toBe(4100);
  });

  it('gives change for a pure-Riel tender entirely in Riel', async () => {
    const token = await cashierToken();

    // total = 3.25, tendered 20,000 riel (~$4.878 at 4100) -> change ~= $1.628 -> rounds to $1.63
    // -> entirely riel: round(1.63 * 4100 / 100) * 100 = 6700
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: await testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 0,
        amountTenderedRiel: 20000,
      });

    expect(response.status).toBe(201);
    expect(response.body.changeGivenUsd).toBe(0);
    expect(response.body.changeGivenRiel).toBe(6700);
  });

  it('gives change for a mixed USD+Riel tender entirely in Riel, not split into USD notes', async () => {
    const token = await cashierToken();

    // total = 3.25, tendered $5 + 1,000 riel (~$0.2439 at 4100) -> tendered ~= 5.2439 -> change ~= 1.9939 -> rounds to $1.99
    // -> entirely riel (not $1 + remainder, since the tender mixed both currencies):
    // round(1.99 * 4100 / 100) * 100 = 8200
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: await testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 5,
        amountTenderedRiel: 1000,
      });

    expect(response.status).toBe(201);
    expect(response.body.changeGivenUsd).toBe(0);
    expect(response.body.changeGivenRiel).toBe(8200);
  });

  it('rejects a cash order whose combined USD+Riel tender is insufficient', async () => {
    const token = await cashierToken();

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: await testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 1,
        amountTenderedRiel: 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Insufficient payment');
  });
});

describe('daily summary date range (store-local timezone)', () => {
  beforeEach(async () => {
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  it('buckets an order by the store-local calendar day, not its UTC calendar day', async () => {
    const pinHash = await hashPin('1234');
    await db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();

    // 18:30 UTC on the 29th is 01:30 local (store is UTC+7) on the 30th - a
    // report for local "the 30th" must include this order; a report for
    // local "the 29th" must not.
    await db.insert(orders).values({
      id: 'order-1',
      userId: 'cashier-1',
      orderNumber: 1,
      subtotal: 5,
      totalAmount: 5,
      createdAt: '2026-08-29 18:30:00',
    }).run();

    const sameLocalDay = await request(app).get('/api/reports/daily-summary?startDate=2026-08-30&endDate=2026-08-30');
    expect(sameLocalDay.body.metrics.totalOrders).toBe(1);
    expect(sameLocalDay.body.hourlyVolume.find((h: { hour: number }) => h.hour === 1)?.orderCount).toBe(1);

    const previousUtcDay = await request(app).get('/api/reports/daily-summary?startDate=2026-08-29&endDate=2026-08-29');
    expect(previousUtcDay.body.metrics.totalOrders).toBe(0);
  });
});

describe('order list and detail', () => {
  beforeEach(async () => {
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  async function cashierToken() {
    const pinHash = await hashPin('1234');
    await db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    return signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });
  }

  async function testProductId(): Promise<string> {
    const existing = await db.select({ id: products.id }).from(products).limit(1).get();
    if (existing) {
      return existing.id;
    }

    const categoryId = randomUUID();
    const productId = randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'Test Category' }).run();
    await db.insert(products).values({ id: productId, categoryId, name: 'Test Product', basePrice: 3.25 }).run();
    return productId;
  }

  it('requires authentication for both endpoints', async () => {
    const listResponse = await request(app).get('/api/orders');
    expect(listResponse.status).toBe(401);

    const detailResponse = await request(app).get('/api/orders/some-id');
    expect(detailResponse.status).toBe(401);
  });

  it('lists orders within the date range and includes a detail view with items, modifiers, and payment', async () => {
    const token = await cashierToken();

    // orderItemModifiers.modifierId is a real FK - needs an actual modifier row.
    const groupId = randomUUID();
    const modifierId = randomUUID();
    await db.insert(modifierGroups).values({ id: groupId, name: 'Milk Choice' }).run();
    await db.insert(modifiers).values({ id: modifierId, groupId, name: 'Oat Milk', priceExtra: 0.5 }).run();

    const createResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{
          productId: await testProductId(),
          productName: 'Latte',
          quantity: 2,
          unitPrice: 4,
          selectedModifiers: [{ id: modifierId, name: 'Oat Milk', priceExtra: 0.5 }],
        }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 10,
        amountTenderedRiel: 0,
      });
    expect(createResponse.status).toBe(201);
    const orderId = createResponse.body.orderId;

    // No date params - defaults to the store's local "today", which the
    // just-created order necessarily falls within regardless of the
    // machine's own timezone or where UTC-vs-local midnight currently sits.
    const listResponse = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({
      id: orderId,
      cashierName: 'Cashier',
      paymentMethod: 'CASH',
      itemCount: 1,
    });

    const detailResponse = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.cashierName).toBe('Cashier');
    expect(detailResponse.body.items).toHaveLength(1);
    expect(detailResponse.body.items[0]).toMatchObject({ productName: 'Latte', quantity: 2 });
    expect(detailResponse.body.items[0].modifiers).toEqual([{ modifierName: 'Oat Milk', priceExtra: 0.5 }]);
    expect(detailResponse.body.payment).toMatchObject({ paymentMethod: 'CASH', amountTenderedUsd: 10 });
  });

  it('narrows the list to the caller\'s own orders with mine=true', async () => {
    const token = await cashierToken();
    const pinHash = await hashPin('5678');
    await db.insert(users).values({ id: 'cashier-2', name: 'Other Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    const otherToken = signToken({ id: 'cashier-2', name: 'Other Cashier', role: 'CASHIER' });
    const productId = await testProductId();

    for (const bearer of [token, otherToken]) {
      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${bearer}`)
        .send({
          items: [{ productId, productName: 'Latte', quantity: 1, unitPrice: 4 }],
          paymentMethod: 'CARD',
        });
      expect(createResponse.status).toBe(201);
    }

    const allResponse = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(allResponse.body).toHaveLength(2);

    const mineResponse = await request(app)
      .get('/api/orders?mine=true')
      .set('Authorization', `Bearer ${token}`);
    expect(mineResponse.status).toBe(200);
    expect(mineResponse.body).toHaveLength(1);
    expect(mineResponse.body[0].cashierName).toBe('Cashier');
  });

  it('returns 404 for an unknown order id', async () => {
    const token = await cashierToken();

    const response = await request(app)
      .get('/api/orders/does-not-exist')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});

describe('category deletion', () => {
  beforeEach(async () => {
    // Doesn't touch categories/products - the real seeded catalog stays
    // intact (recipes/orderItems reference it), only test-created rows
    // (given high sortOrder values below, out of the seeded range) are used.
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  async function managerToken() {
    const pinHash = await hashPin('9999');
    await db.insert(users).values({ id: 'manager-1', name: 'Manager', pinHash, role: 'MANAGER', isActive: true }).run();
    return signToken({ id: 'manager-1', name: 'Manager', role: 'MANAGER' });
  }

  it('rejects deletion when the category still has products assigned and no reassignment target is given', async () => {
    const token = await managerToken();
    const categoryId = randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'Test Drinks', sortOrder: 1000 }).run();
    await db.insert(products).values({ id: randomUUID(), categoryId, name: 'Test Latte', basePrice: 4 }).run();

    const response = await request(app)
      .delete(`/api/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.productCount).toBe(1);
    expect(await db.select().from(categories).where(eq(categories.id, categoryId)).get()).toBeDefined();

    await db.delete(products).where(eq(products.categoryId, categoryId)).run();
    await db.delete(categories).where(eq(categories.id, categoryId)).run();
  });

  it('reassigns products to the target category and deletes the source category', async () => {
    const token = await managerToken();
    const sourceId = randomUUID();
    const targetId = randomUUID();
    const productId = randomUUID();
    await db.insert(categories).values([
      { id: sourceId, name: 'Test Source', sortOrder: 1000 },
      { id: targetId, name: 'Test Target', sortOrder: 1001 },
    ]).run();
    await db.insert(products).values({ id: productId, categoryId: sourceId, name: 'Test Latte', basePrice: 4 }).run();

    const response = await request(app)
      .delete(`/api/categories/${sourceId}?reassignToCategoryId=${targetId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.reassignedCount).toBe(1);
    expect(await db.select().from(categories).where(eq(categories.id, sourceId)).get()).toBeUndefined();
    expect(await db.select().from(products).where(eq(products.id, productId)).get()).toMatchObject({ categoryId: targetId });

    await db.delete(products).where(eq(products.id, productId)).run();
    await db.delete(categories).where(eq(categories.id, targetId)).run();
  });

  it('rejects reassigning products to the category being deleted', async () => {
    const token = await managerToken();
    const categoryId = randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'Test Drinks', sortOrder: 1000 }).run();
    await db.insert(products).values({ id: randomUUID(), categoryId, name: 'Test Latte', basePrice: 4 }).run();

    const response = await request(app)
      .delete(`/api/categories/${categoryId}?reassignToCategoryId=${categoryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);

    await db.delete(products).where(eq(products.categoryId, categoryId)).run();
    await db.delete(categories).where(eq(categories.id, categoryId)).run();
  });

  it('rejects reassigning to a non-existent target category', async () => {
    const token = await managerToken();
    const categoryId = randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'Test Drinks', sortOrder: 1000 }).run();
    await db.insert(products).values({ id: randomUUID(), categoryId, name: 'Test Latte', basePrice: 4 }).run();

    const response = await request(app)
      .delete(`/api/categories/${categoryId}?reassignToCategoryId=does-not-exist`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);

    await db.delete(products).where(eq(products.categoryId, categoryId)).run();
    await db.delete(categories).where(eq(categories.id, categoryId)).run();
  });

  it('deletes an empty category and compacts the remaining sortOrder values', async () => {
    const token = await managerToken();
    // High sortOrder values, clear of the real seeded categories, so the
    // recalculation's effect on these three is checkable by their *relative*
    // spacing regardless of how many other categories precede them globally.
    const [catA, catB, catC, catD] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await db.insert(categories).values([
      { id: catA, name: 'Test A', sortOrder: 1000 },
      { id: catB, name: 'Test B', sortOrder: 1001 },
      { id: catC, name: 'Test C', sortOrder: 1002 },
      { id: catD, name: 'Test D', sortOrder: 1003 },
    ]).run();

    const response = await request(app)
      .delete(`/api/categories/${catB}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    const a = await db.select().from(categories).where(eq(categories.id, catA)).get();
    const c = await db.select().from(categories).where(eq(categories.id, catC)).get();
    const d = await db.select().from(categories).where(eq(categories.id, catD)).get();

    expect(c!.sortOrder).toBe(a!.sortOrder! + 1);
    expect(d!.sortOrder).toBe(a!.sortOrder! + 2);

    await db.delete(categories).where(eq(categories.id, catA)).run();
    await db.delete(categories).where(eq(categories.id, catC)).run();
    await db.delete(categories).where(eq(categories.id, catD)).run();
  });
});

describe('inventory item deletion', () => {
  beforeEach(async () => {
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  async function managerToken() {
    const pinHash = await hashPin('9999');
    await db.insert(users).values({ id: 'manager-1', name: 'Manager', pinHash, role: 'MANAGER', isActive: true }).run();
    return signToken({ id: 'manager-1', name: 'Manager', role: 'MANAGER' });
  }

  // Turso enforces foreign keys (unlike the on-prem better-sqlite3 setup,
  // which silently orphaned these rows) - a real stock_adjustments row
  // referencing this item must block deletion with a clear 409, not surface
  // the underlying FK violation as a raw 500.
  it('rejects deletion when the item has stock adjustment history', async () => {
    const token = await managerToken();
    const itemId = randomUUID();
    await db.insert(inventoryItems).values({ id: itemId, name: 'Test Milk', unit: 'ml', reorderThreshold: 100, costPerUnit: 0.001 }).run();
    await db.insert(stockAdjustments).values({
      id: randomUUID(), inventoryItemId: itemId, userId: 'manager-1', quantityChanged: 1000, type: 'RESTOCK',
    }).run();

    const response = await request(app)
      .delete(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).get()).toBeDefined();

    await db.delete(stockAdjustments).where(eq(stockAdjustments.inventoryItemId, itemId)).run();
    await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId)).run();
  });

  it('deletes an item with no adjustment or recipe history', async () => {
    const token = await managerToken();
    const itemId = randomUUID();
    await db.insert(inventoryItems).values({ id: itemId, name: 'Test Sugar', unit: 'g', reorderThreshold: 100, costPerUnit: 0.001 }).run();

    const response = await request(app)
      .delete(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).get()).toBeUndefined();
  });
});

describe('modifier group management', () => {
  beforeEach(async () => {
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  async function managerToken() {
    const pinHash = await hashPin('9999');
    await db.insert(users).values({ id: 'manager-1', name: 'Manager', pinHash, role: 'MANAGER', isActive: true }).run();
    return signToken({ id: 'manager-1', name: 'Manager', role: 'MANAGER' });
  }

  async function testProduct() {
    const categoryId = randomUUID();
    const productId = randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'Test Modifier Drinks', sortOrder: 1000 }).run();
    await db.insert(products).values({ id: productId, categoryId, name: 'Test Latte', basePrice: 4 }).run();
    return { categoryId, productId };
  }

  async function cleanup(groupId: string, fixture: { categoryId: string; productId: string }) {
    await db.delete(productModifiers).where(eq(productModifiers.groupId, groupId)).run();
    await db.delete(modifiers).where(eq(modifiers.groupId, groupId)).run();
    await db.delete(modifierGroups).where(eq(modifierGroups.id, groupId)).run();
    await db.delete(products).where(eq(products.id, fixture.productId)).run();
    await db.delete(categories).where(eq(categories.id, fixture.categoryId)).run();
  }

  it('rejects a group whose minimum selection exceeds its maximum', async () => {
    const token = await managerToken();

    const response = await request(app)
      .post('/api/modifiers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sweetness', minSelection: 2, maxSelection: 1, options: [{ name: 'Less', priceExtra: 0 }, { name: 'More', priceExtra: 0 }] });

    expect(response.status).toBe(400);
  });

  it('creates a group with options and product links, then updates it in place', async () => {
    const token = await managerToken();
    const fixture = await testProduct();

    const createResponse = await request(app)
      .post('/api/modifiers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Milk',
        minSelection: 0,
        maxSelection: 1,
        options: [{ name: 'Oat Milk', priceExtra: 0.5 }, { name: 'Soy Milk', priceExtra: 0.5 }],
        productIds: [fixture.productId],
      });

    expect(createResponse.status).toBe(201);
    const group = createResponse.body;
    expect(group.options).toHaveLength(2);
    expect(group.productIds).toEqual([fixture.productId]);

    const oat = group.options.find((o: { name: string }) => o.name === 'Oat Milk');
    const updateResponse = await request(app)
      .put(`/api/modifiers/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Milk Choice',
        minSelection: 1,
        maxSelection: 1,
        options: [{ id: oat.id, name: 'Oat Milk', priceExtra: 0.75 }, { name: 'Almond Milk', priceExtra: 0.75 }],
        productIds: [],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.name).toBe('Test Milk Choice');
    expect(updateResponse.body.productIds).toEqual([]);
    expect(updateResponse.body.options.map((o: { name: string }) => o.name).sort()).toEqual(['Almond Milk', 'Oat Milk']);
    // The kept option keeps its id, so its recipe links and order history survive.
    expect(updateResponse.body.options.find((o: { id: string }) => o.id === oat.id).priceExtra).toBe(0.75);

    await cleanup(group.id, fixture);
  });

  it('refuses to remove an option or delete a group that has order history', async () => {
    const token = await managerToken();
    const fixture = await testProduct();
    const groupId = randomUUID();
    const optionId = randomUUID();
    await db.insert(modifierGroups).values({ id: groupId, name: 'Test Syrup', minSelection: 0, maxSelection: 1 }).run();
    await db.insert(modifiers).values({ id: optionId, groupId, name: 'Vanilla', priceExtra: 0.5 }).run();

    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{
          productId: fixture.productId,
          productName: 'Test Latte',
          quantity: 1,
          unitPrice: 4,
          selectedModifiers: [{ id: optionId, name: 'Vanilla', priceExtra: 0.5 }],
        }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 10,
        amountTenderedRiel: 0,
      });
    expect(orderResponse.status).toBe(201);

    const updateResponse = await request(app)
      .put(`/api/modifiers/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Syrup', minSelection: 0, maxSelection: 1, options: [{ name: 'Caramel', priceExtra: 0.5 }] });
    expect(updateResponse.status).toBe(409);

    const deleteResponse = await request(app)
      .delete(`/api/modifiers/${groupId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(409);
    expect(await db.select().from(modifiers).where(eq(modifiers.id, optionId)).get()).toBeDefined();

    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await cleanup(groupId, fixture);
  });

  it('deletes a group with no order history along with its options and product links', async () => {
    const token = await managerToken();
    const fixture = await testProduct();
    const groupId = randomUUID();
    await db.insert(modifierGroups).values({ id: groupId, name: 'Test Size', minSelection: 1, maxSelection: 1 }).run();
    await db.insert(modifiers).values({ id: randomUUID(), groupId, name: 'Large', priceExtra: 1 }).run();
    await db.insert(productModifiers).values({ productId: fixture.productId, groupId }).run();

    const response = await request(app)
      .delete(`/api/modifiers/${groupId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await db.select().from(modifierGroups).where(eq(modifierGroups.id, groupId)).get()).toBeUndefined();
    expect(await db.select().from(productModifiers).where(eq(productModifiers.groupId, groupId)).all()).toEqual([]);

    await cleanup(groupId, fixture);
  });
});

describe('order void', () => {
  beforeEach(async () => {
    await db.delete(payments).run();
    await db.delete(orderItemModifiers).run();
    await db.delete(orderItems).run();
    await db.delete(orders).run();
    await db.delete(stockAdjustments).run();
    await db.delete(users).run();
  });

  async function userToken(id: string, role: 'CASHIER' | 'MANAGER') {
    const pinHash = await hashPin(id);
    await db.insert(users).values({ id, name: id, pinHash, role, isActive: true }).run();
    return signToken({ id, name: id, role });
  }

  // A product whose recipe uses 18g of a fresh inventory item, so the test
  // can check the exact stock deducted by a sale and returned by its void.
  async function productWithRecipe() {
    const categoryId = randomUUID();
    const productId = randomUUID();
    const inventoryItemId = randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'Void Test Category' }).run();
    await db.insert(products).values({ id: productId, categoryId, name: 'Void Test Espresso', basePrice: 2 }).run();
    await db.insert(inventoryItems).values({ id: inventoryItemId, name: 'Void Test Beans', unit: 'g', stockQuantity: 1000 }).run();
    await db.insert(recipes).values({ id: randomUUID(), productId, inventoryItemId, quantityRequired: 18 }).run();
    return { productId, inventoryItemId };
  }

  async function placeOrder(token: string, productId: string) {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId, productName: 'Espresso', quantity: 2, unitPrice: 2 }], paymentMethod: 'CARD' });
    expect(response.status).toBe(201);
    return response.body.orderId as string;
  }

  async function stockOf(inventoryItemId: string) {
    const row = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId)).get();
    return row?.stockQuantity;
  }

  it('voids the cashier\'s own order, records the reason, and returns the deducted stock', async () => {
    const token = await userToken('cashier-void', 'CASHIER');
    const { productId, inventoryItemId } = await productWithRecipe();
    const orderId = await placeOrder(token, productId);
    expect(await stockOf(inventoryItemId)).toBe(1000 - 36);

    const response = await request(app)
      .post(`/api/orders/${orderId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong item' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, status: 'VOIDED' });
    expect(await stockOf(inventoryItemId)).toBe(1000);

    const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    expect(order).toMatchObject({ status: 'VOIDED', voidedBy: 'cashier-void', voidReason: 'Wrong item' });
    expect(order?.voidedAt).toBeTruthy();
  });

  it('refuses to void the same order twice and does not restock again', async () => {
    const token = await userToken('cashier-void', 'CASHIER');
    const { productId, inventoryItemId } = await productWithRecipe();
    const orderId = await placeOrder(token, productId);

    const first = await request(app).post(`/api/orders/${orderId}/void`).set('Authorization', `Bearer ${token}`).send({ reason: 'Mistake' });
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/orders/${orderId}/void`).set('Authorization', `Bearer ${token}`).send({ reason: 'Mistake' });
    expect(second.status).toBe(409);
    expect(await stockOf(inventoryItemId)).toBe(1000);
  });

  it('stops a cashier voiding another cashier\'s order, but lets a manager', async () => {
    const ownerToken = await userToken('cashier-owner', 'CASHIER');
    const otherToken = await userToken('cashier-other', 'CASHIER');
    const managerToken = await userToken('manager-void', 'MANAGER');
    const { productId } = await productWithRecipe();
    const orderId = await placeOrder(ownerToken, productId);

    const forbidden = await request(app).post(`/api/orders/${orderId}/void`).set('Authorization', `Bearer ${otherToken}`).send({ reason: 'Not mine' });
    expect(forbidden.status).toBe(403);

    const allowed = await request(app).post(`/api/orders/${orderId}/void`).set('Authorization', `Bearer ${managerToken}`).send({ reason: 'Customer complaint' });
    expect(allowed.status).toBe(200);
  });

  it('requires a reason, authentication, and an existing order', async () => {
    const token = await userToken('cashier-void', 'CASHIER');
    const { productId } = await productWithRecipe();
    const orderId = await placeOrder(token, productId);

    const noReason = await request(app).post(`/api/orders/${orderId}/void`).set('Authorization', `Bearer ${token}`).send({ reason: '  ' });
    expect(noReason.status).toBe(400);

    const noAuth = await request(app).post(`/api/orders/${orderId}/void`).send({ reason: 'Mistake' });
    expect(noAuth.status).toBe(401);

    const missing = await request(app).post('/api/orders/does-not-exist/void').set('Authorization', `Bearer ${token}`).send({ reason: 'Mistake' });
    expect(missing.status).toBe(404);
  });
});
