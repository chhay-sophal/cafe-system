import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import {
  orderItemModifiers, orderItems, orders, payments, stockAdjustments, users,
} from './db/schema.js';
import { hashPin } from './middleware/auth.js';

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
