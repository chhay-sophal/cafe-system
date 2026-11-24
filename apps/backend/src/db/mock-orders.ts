// Dev-only: fills the local database with realistic mock sales for trying out
// the IMS analytics and the POS sales history.
//
//   pnpm db:mock-orders              add 30 days of sales ending now
//   pnpm db:mock-orders --days 7     a different number of days
//   pnpm db:mock-orders --replace    remove earlier mock sales first
//   pnpm db:mock-orders --remove     only remove mock sales
//   pnpm db:mock-orders --yes        skip the confirmation prompt
//
// Sales use the catalog and staff already in the database (run db:seed first
// on an empty one) and the backend's own cash/change rules. Every row it adds
// has an id starting with "mock-", which is how --replace/--remove find them -
// real sales are never touched. Inventory stock is not deducted.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { eq, like, sql, isNull } from 'drizzle-orm';
import { db } from './index.js';
import {
  modifiers, orderItemModifiers, orderItems, orders, payments, productModifiers, products, storeSettings, users,
} from './schema.js';
import { env } from '../env.js';
import { computeChange, isTenderSufficient, round2, usdToRiel } from '../lib/cash.js';

const MOCK_ID_PREFIX = 'mock-';
const STORE_UTC_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Phnom_Penh, as in app.ts
const DEFAULT_EXCHANGE_RATE_RIEL_PER_USD = 4100; // backend default when unset

// Relative order volume per local opening hour (07:00-19:59): breakfast and
// lunch rushes, quiet mid-morning and evening.
const HOUR_WEIGHTS: Record<number, number> = {
  7: 9, 8: 12, 9: 8, 10: 5, 11: 6, 12: 9, 13: 8, 14: 5, 15: 6, 16: 6, 17: 5, 18: 4, 19: 2,
};
const ROLE_WEIGHTS: Record<string, number> = { CASHIER: 50, BARISTA: 35, MANAGER: 8, ADMIN: 2 };
const PAYMENT_WEIGHTS = { CASH: 55, QR_CODE: 35, CARD: 10 } as const;
const VOID_REASONS = ['Wrong item rung up', 'Customer changed their mind', 'Duplicate sale', 'Payment failed'];

type Product = { id: string; name: string; basePrice: number };
type Modifier = { id: string; name: string; priceExtra: number };

function mockId(): string {
  return `${MOCK_ID_PREFIX}${randomUUID()}`;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function weightedPick<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  let roll = Math.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) {
      return value;
    }
  }
  return entries[entries.length - 1]![0];
}

// Normally distributed, for day-to-day variation in order volume.
function gaussian(mean: number, stdDev: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function toSqliteTimestamp(at: Date): string {
  return at.toISOString().slice(0, 19).replace('T', ' ');
}

// The store-local calendar date (YYYY-MM-DD) of a UTC instant.
function storeDate(at: Date): string {
  return new Date(at.getTime() + STORE_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

// Lattes sell best; anything not listed (e.g. products added later) gets an
// average share.
function productWeight(product: Product): number {
  const name = product.name.toLowerCase();
  if (name.includes('iced') && name.includes('latte')) return 30;
  if (name.includes('latte')) return 35;
  if (name.includes('americano')) return 20;
  if (name.includes('espresso')) return 15;
  return 15;
}

// How a customer plausibly pays `totalUsd` in cash: USD notes, Riel notes, or
// whole dollars plus Riel for the rest.
function cashTender(totalUsd: number, rate: number): { usd: number; riel: number } {
  const style = Math.random();
  if (style < 0.45) {
    const options = [roundUp(totalUsd, 1), roundUp(totalUsd, 5), roundUp(totalUsd, 10), 20].filter((o) => o >= totalUsd);
    return { usd: pick(options), riel: 0 };
  }
  if (style < 0.85) {
    const rielTotal = usdToRiel(totalUsd, rate);
    const options = [rielTotal, roundUp(rielTotal, 1000), roundUp(rielTotal, 5000), roundUp(rielTotal, 10000), 50000]
      .filter((o) => o >= rielTotal);
    return { usd: 0, riel: pick(options) };
  }
  const wholeUsd = Math.floor(totalUsd);
  return { usd: wholeUsd, riel: roundUp(usdToRiel(totalUsd - wholeUsd, rate), 1000) };
}

function parseArgs(argv: string[]) {
  const options = { days: 30, replace: false, remove: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--replace') options.replace = true;
    else if (arg === '--remove') options.remove = true;
    else if (arg === '--yes' || arg === '-y') options.yes = true;
    else if (arg === '--days' || arg.startsWith('--days=')) {
      const value = Number(arg.includes('=') ? arg.split('=')[1] : argv[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 366) {
        throw new Error('--days must be a whole number from 1 to 366');
      }
      options.days = value;
    } else if (arg !== '--') {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

async function countMockOrders(): Promise<number> {
  const row = await db.select({ count: sql<number>`count(*)` }).from(orders).where(like(orders.id, `${MOCK_ID_PREFIX}%`)).get();
  return row?.count ?? 0;
}

async function removeMockOrders(): Promise<number> {
  const count = await countMockOrders();
  await db.transaction(async (tx) => {
    await tx.delete(orderItemModifiers).where(like(orderItemModifiers.id, `${MOCK_ID_PREFIX}%`)).run();
    await tx.delete(orderItems).where(like(orderItems.id, `${MOCK_ID_PREFIX}%`)).run();
    await tx.delete(payments).where(like(payments.id, `${MOCK_ID_PREFIX}%`)).run();
    await tx.delete(orders).where(like(orders.id, `${MOCK_ID_PREFIX}%`)).run();
  });
  return count;
}

async function addMockOrders(days: number) {
  const productList: Product[] = await db
    .select({ id: products.id, name: products.name, basePrice: products.basePrice })
    .from(products)
    .where(isNull(products.deletedAt));
  const staff = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.isActive, true));
  if (productList.length === 0 || staff.length === 0) {
    throw new Error('No products or active staff to sell with - run db:seed (or add some in IMS) first.');
  }

  const modifierRows = await db
    .select({ productId: productModifiers.productId, id: modifiers.id, name: modifiers.name, priceExtra: modifiers.priceExtra })
    .from(productModifiers)
    .innerJoin(modifiers, eq(modifiers.groupId, productModifiers.groupId));
  const modifiersByProduct = new Map<string, Modifier[]>();
  for (const { productId, ...modifier } of modifierRows) {
    modifiersByProduct.set(productId, [...(modifiersByProduct.get(productId) ?? []), modifier]);
  }

  const settings = await db.select().from(storeSettings).where(eq(storeSettings.id, 'default')).get();
  const rate = settings?.exchangeRateRielPerUsd ?? DEFAULT_EXCHANGE_RATE_RIEL_PER_USD;
  const productEntries = productList.map((product) => [product, productWeight(product)] as const);
  const staffEntries = staff.map((user) => [user.id, ROLE_WEIGHTS[user.role] ?? 5] as const);
  const managerIds = staff.filter((user) => user.role === 'MANAGER' || user.role === 'ADMIN').map((user) => user.id);
  const paymentEntries = Object.entries(PAYMENT_WEIGHTS) as Array<[keyof typeof PAYMENT_WEIGHTS, number]>;

  const now = new Date();
  const totals = { orders: 0, voided: 0, drinks: 0, revenue: 0 };

  for (let daysAgo = days - 1; daysAgo >= 0; daysAgo--) {
    const day = storeDate(new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000));
    const isWeekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
    // Busier on weekends, with a gentle upward trend across the range.
    const expected = (isWeekend ? 78 : 52) * (0.9 + (0.2 * (days - daysAgo)) / days);
    const count = Math.max(10, Math.round(gaussian(expected, expected * 0.12)));

    const hourEntries = Object.entries(HOUR_WEIGHTS).map(([hour, weight]) => [Number(hour), weight] as const);
    const saleTimes = Array.from({ length: count }, () => {
      const localMidnightUtc = Date.parse(`${day}T00:00:00Z`) - STORE_UTC_OFFSET_MS;
      const secondsIntoDay = weightedPick(hourEntries) * 3600 + randomInt(0, 3599);
      return new Date(localMidnightUtc + secondsIntoDay * 1000);
    })
      .filter((at) => at <= now) // today: only up to now
      .sort((a, b) => a.getTime() - b.getTime());

    // Numbers continue after any sales already recorded that day.
    const lastNumber = (await db.select({ max: sql<number | null>`max(${orders.orderNumber})` })
      .from(orders)
      .where(eq(sql`date(${orders.createdAt}, '+7 hours')`, day))
      .get())?.max ?? 0;

    const orderRows: Array<typeof orders.$inferInsert> = [];
    const paymentRows: Array<typeof payments.$inferInsert> = [];
    const itemRows: Array<typeof orderItems.$inferInsert> = [];
    const itemModifierRows: Array<typeof orderItemModifiers.$inferInsert> = [];

    saleTimes.forEach((soldAt, index) => {
      const orderId = mockId();
      const createdAt = toSqliteTimestamp(soldAt);
      let subtotal = 0;

      const lineCount = weightedPick([[1, 60], [2, 28], [3, 10], [4, 2]] as const);
      for (let line = 0; line < lineCount; line++) {
        const product = weightedPick(productEntries);
        const quantity = weightedPick([[1, 90], [2, 10]] as const);
        // Each available modifier (oat milk, syrup...) on roughly a quarter of drinks.
        const chosen = (modifiersByProduct.get(product.id) ?? []).filter(() => Math.random() < 0.27);
        const itemId = mockId();

        subtotal += (product.basePrice + chosen.reduce((sum, m) => sum + m.priceExtra, 0)) * quantity;
        itemRows.push({
          id: itemId,
          orderId,
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: product.basePrice,
          totalPrice: product.basePrice * quantity,
        });
        for (const modifier of chosen) {
          itemModifierRows.push({
            id: mockId(),
            orderItemId: itemId,
            modifierId: modifier.id,
            modifierName: modifier.name,
            priceExtra: modifier.priceExtra,
          });
        }
        totals.drinks += quantity;
      }

      subtotal = round2(subtotal);
      const discountAmount = Math.random() < 0.03 ? round2(subtotal * 0.1) : 0;
      const totalAmount = round2(subtotal - discountAmount);

      const paymentMethod = weightedPick(paymentEntries);
      let tendered = { usd: totalAmount, riel: 0 };
      let change = { usd: 0, riel: 0 };
      if (paymentMethod === 'CASH') {
        tendered = cashTender(totalAmount, rate);
        if (!isTenderSufficient(totalAmount, rate, tendered.usd, tendered.riel)) {
          throw new Error(`Generated insufficient cash for ${totalAmount}: ${JSON.stringify(tendered)}`);
        }
        const changeDueUsd = Math.max(0, round2(tendered.usd + tendered.riel / rate - totalAmount));
        change = computeChange(changeDueUsd, rate, tendered.usd, tendered.riel);
      }

      const isVoided = managerIds.length > 0 && Math.random() < 0.015;
      orderRows.push({
        id: orderId,
        userId: weightedPick(staffEntries),
        orderNumber: lastNumber + index + 1,
        subtotal,
        taxAmount: 0,
        discountAmount,
        totalAmount,
        status: isVoided ? 'VOIDED' : 'COMPLETED',
        createdAt,
        ...(isVoided
          ? {
            voidedAt: toSqliteTimestamp(new Date(soldAt.getTime() + randomInt(1, 20) * 60 * 1000)),
            voidedBy: pick(managerIds),
            voidReason: pick(VOID_REASONS),
          }
          : {}),
      });
      paymentRows.push({
        id: mockId(),
        orderId,
        paymentMethod,
        amountTenderedUsd: tendered.usd,
        amountTenderedRiel: tendered.riel,
        changeGivenUsd: change.usd,
        changeGivenRiel: change.riel,
        exchangeRateRielPerUsd: rate,
        createdAt,
      });

      totals.orders += 1;
      totals.voided += isVoided ? 1 : 0;
      totals.revenue += isVoided ? 0 : totalAmount;
    });

    if (orderRows.length === 0) {
      continue;
    }
    // One transaction per day, in FK order. Chunked so no single statement
    // exceeds SQLite's bound-parameter limit.
    await db.transaction(async (tx) => {
      const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / 50) }, (_, i) => rows.slice(i * 50, i * 50 + 50));
      for (const chunk of chunks(orderRows)) await tx.insert(orders).values(chunk).run();
      for (const chunk of chunks(paymentRows)) await tx.insert(payments).values(chunk).run();
      for (const chunk of chunks(itemRows)) await tx.insert(orderItems).values(chunk).run();
      for (const chunk of chunks(itemModifierRows)) await tx.insert(orderItemModifiers).values(chunk).run();
    });
  }

  const firstDay = storeDate(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  console.log(
    `✅ Added ${totals.orders} mock sales (${totals.voided} voided), ${totals.drinks} drinks, `
    + `$${totals.revenue.toFixed(2)} completed revenue, ${firstDay} to ${storeDate(now)} (store time), rate ${rate}.`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Mock sales must never reach a real shop's records: no remote (Turso)
  // databases, nothing marked production, and a confirmation naming the file.
  if (!env.TURSO_DATABASE_URL.startsWith('file:')) {
    throw new Error('Refusing to run: TURSO_DATABASE_URL is a remote database. db:mock-orders is for local dev databases only.');
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run with NODE_ENV=production.');
  }
  const dbPath = env.TURSO_DATABASE_URL.slice('file:'.length);

  // Checked before asking, so a plain re-run doesn't double the data.
  const existing = await countMockOrders();
  if (existing > 0 && !options.replace && !options.remove) {
    throw new Error(`The database already has ${existing} mock sales. Use --replace to regenerate them, or --remove to clear them.`);
  }

  const action = options.remove
    ? 'Remove all mock sales from'
    : `${options.replace ? 'Replace mock sales with' : 'Add'} ${options.days} days of mock sales ${options.replace ? 'in' : 'to'}`;
  if (!options.yes && !(await confirm(`${action} ${dbPath}?`))) {
    console.log('Cancelled.');
    return;
  }

  if (options.remove || options.replace) {
    console.log(`🧹 Removed ${await removeMockOrders()} earlier mock sales.`);
  }
  if (options.remove) {
    return;
  }

  await addMockOrders(options.days);
}

main().catch((error) => {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
