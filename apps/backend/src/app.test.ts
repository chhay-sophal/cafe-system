import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import {
  categories, orderItemModifiers, orderItems, orders, payments, products, stockAdjustments, storeSettings, users,
} from './db/schema.js';
import { hashPin, signToken } from './middleware/auth.js';

const app = createApp();

describe('backend auth and validation', () => {
  beforeEach(async () => {
    // This suite runs against the real dev database (no test-DB isolation),
    // so users must be cleared in FK-dependency order - any leftover orders
    // or stock adjustments referencing a user otherwise abort the delete
    // with a foreign key constraint failure.
    db.delete(payments).run();
    db.delete(orderItemModifiers).run();
    db.delete(orderItems).run();
    db.delete(orders).run();
    db.delete(stockAdjustments).run();
    db.delete(users).run();
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
    db.insert(users).values({
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
    db.delete(storeSettings).run();
    db.delete(payments).run();
    db.delete(orderItemModifiers).run();
    db.delete(orderItems).run();
    db.delete(orders).run();
    db.delete(stockAdjustments).run();
    db.delete(users).run();
  });

  it('returns the default rate and main currency when none has been set', async () => {
    const response = await request(app).get('/api/settings/exchange-rate');

    expect(response.status).toBe(200);
    expect(response.body.exchangeRateRielPerUsd).toBe(4100);
    expect(response.body.mainCurrency).toBe('USD');
  });

  it('rejects a rate update from a non-admin', async () => {
    const pinHash = await hashPin('1234');
    db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    const token = signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });

    const response = await request(app)
      .put('/api/settings/exchange-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ exchangeRateRielPerUsd: 4200 });

    expect(response.status).toBe(403);
  });

  it('lets an admin update the rate, reflected by later reads', async () => {
    const pinHash = await hashPin('9999');
    db.insert(users).values({ id: 'admin-1', name: 'Admin', pinHash, role: 'ADMIN', isActive: true }).run();
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
    db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    const token = signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });

    const response = await request(app)
      .put('/api/settings/main-currency')
      .set('Authorization', `Bearer ${token}`)
      .send({ mainCurrency: 'KHR' });

    expect(response.status).toBe(403);
  });

  it('lets an admin switch the main currency to KHR, reflected by later reads', async () => {
    const pinHash = await hashPin('9999');
    db.insert(users).values({ id: 'admin-1', name: 'Admin', pinHash, role: 'ADMIN', isActive: true }).run();
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
    db.insert(users).values({ id: 'admin-1', name: 'Admin', pinHash, role: 'ADMIN', isActive: true }).run();
    const token = signToken({ id: 'admin-1', name: 'Admin', role: 'ADMIN' });

    const response = await request(app)
      .put('/api/settings/main-currency')
      .set('Authorization', `Bearer ${token}`)
      .send({ mainCurrency: 'EUR' });

    expect(response.status).toBe(400);
  });
});

describe('order payments in mixed USD/Riel', () => {
  beforeEach(async () => {
    db.delete(storeSettings).run();
    db.delete(payments).run();
    db.delete(orderItemModifiers).run();
    db.delete(orderItems).run();
    db.delete(orders).run();
    db.delete(stockAdjustments).run();
    db.delete(users).run();
  });

  async function cashierToken() {
    const pinHash = await hashPin('1234');
    db.insert(users).values({ id: 'cashier-1', name: 'Cashier', pinHash, role: 'CASHIER', isActive: true }).run();
    return signToken({ id: 'cashier-1', name: 'Cashier', role: 'CASHIER' });
  }

  // orderItems.productId is a real FK - reuse a seeded product rather than
  // touching the categories/products tables (recipes still reference the
  // seeded catalog, so wiping it here would break unrelated FKs).
  function testProductId(): string {
    const existing = db.select({ id: products.id }).from(products).limit(1).get();
    if (existing) {
      return existing.id;
    }

    const categoryId = randomUUID();
    const productId = randomUUID();
    db.insert(categories).values({ id: categoryId, name: 'Test Category' }).run();
    db.insert(products).values({ id: productId, categoryId, name: 'Test Product', basePrice: 3.25 }).run();
    return productId;
  }

  it('gives change for a pure-USD tender as whole dollars plus a Riel remainder', async () => {
    const token = await cashierToken();

    // total = 3.25, tendered $5 cash -> change $1.75 -> $1 + (0.75 * 4100 default rate) rounded to nearest 100 = 3100 riel
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
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
        items: [{ productId: testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
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
        items: [{ productId: testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
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
        items: [{ productId: testProductId(), productName: 'Latte', quantity: 1, unitPrice: 3.25 }],
        paymentMethod: 'CASH',
        amountTenderedUsd: 1,
        amountTenderedRiel: 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Insufficient payment');
  });
});
