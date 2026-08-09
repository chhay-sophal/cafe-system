import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { hashPin } from './middleware/auth.js';

const app = createApp();

describe('backend auth and validation', () => {
  beforeEach(async () => {
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
