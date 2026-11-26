import { BakongKHQR, IndividualInfo, khqrData } from 'bakong-khqr';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { bakongCredentials } from '../db/schema.js';
import { env } from '../env.js';

// Bakong KHQR for Mobile Pay: a QR carrying the sale's exact amount, made
// here with the National Bank's SDK, and a check against the Bakong Open API
// of whether it has been paid. Adapted from mart-system's payments module.
//
// Checking needs an API token. Bakong issues it to an email registered on
// its developer portal (api-bakong.nbc.gov.kh); the token expires every few
// months and is renewed with that email - done here automatically, the first
// time it's needed and whenever Bakong rejects the one held.

export class BakongError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// How long a QR can be paid for. The register makes a new one after that.
export const KHQR_LIFETIME_MS = 5 * 60 * 1000;

export interface BakongAccount {
  accountId: string;
  merchantName: string;
  merchantCity: string;
}

export function generateKhqr(account: BakongAccount, amount: number, currency: 'USD' | 'KHR', storePhone?: string) {
  // Riel has no cents; dollars have two decimals.
  const exactAmount = currency === 'KHR' ? Math.round(amount) : Math.round(amount * 100) / 100;
  const expiresAt = Date.now() + KHQR_LIFETIME_MS;
  const mobileNumber = toBakongMobile(storePhone);
  const info = new IndividualInfo(
    account.accountId,
    account.merchantName || 'Cafe',
    account.merchantCity || 'Phnom Penh',
    {
      currency: currency === 'KHR' ? khqrData.currency.khr : khqrData.currency.usd,
      amount: exactAmount,
      expirationTimestamp: expiresAt,
      ...(mobileNumber ? { mobileNumber } : {}),
    },
  );
  const result = new BakongKHQR().generateIndividual(info);
  if (!result?.data || result.status?.code !== 0) {
    throw new BakongError(400, result?.status?.message ?? 'Bakong rejected the QR details');
  }
  return {
    qrString: result.data.qr,
    md5: result.data.md5,
    amount: exactAmount,
    currency,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

// Bakong wants "855..." - a local "0..." number gets the country code.
function toBakongMobile(phone: string | undefined): string | undefined {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return undefined;
  const mobile = digits.startsWith('0') ? `855${digits.slice(1)}` : digits;
  return mobile.length <= 25 ? mobile : undefined;
}

// --- Checking payment ------------------------------------------------------

async function bakongFetch(path: string, body: unknown, token?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${env.BAKONG_API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new BakongError(502, 'Could not reach Bakong');
  } finally {
    clearTimeout(timer);
  }
}

async function loadCredential() {
  return db.select().from(bakongCredentials).where(eq(bakongCredentials.id, 'default')).get();
}

async function renewToken(): Promise<string> {
  const email = (await loadCredential())?.registeredEmail;
  if (!email) {
    throw new BakongError(409, 'Bakong payment checks are not set up - an admin needs to enter the Bakong registered email in IMS');
  }
  const response = await bakongFetch('/v1/renew_token', { email });
  const body = (await response.json().catch(() => null)) as { data?: { token?: string }; token?: string } | null;
  const token = body?.data?.token ?? body?.token;
  if (!response.ok || !token) {
    throw new BakongError(502, 'Bakong did not issue a token for the registered email');
  }
  await db.update(bakongCredentials)
    .set({ apiToken: token, apiTokenUpdatedAt: new Date().toISOString() })
    .where(eq(bakongCredentials.id, 'default'))
    .run();
  return token;
}

// PAID once Bakong has a transaction for this QR, otherwise PENDING.
export async function checkKhqrPaid(md5: string): Promise<'PAID' | 'PENDING'> {
  let token = (await loadCredential())?.apiToken ?? (await renewToken());
  let response = await bakongFetch('/v1/check_transaction_by_md5', { md5 }, token);
  if (response.status === 401 || response.status === 403) {
    // The token held has expired - renew once and ask again.
    token = await renewToken();
    response = await bakongFetch('/v1/check_transaction_by_md5', { md5 }, token);
  }
  if (!response.ok) {
    throw new BakongError(502, `Bakong answered ${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as { responseCode?: number } | null;
  return body?.responseCode === 0 ? 'PAID' : 'PENDING';
}

// --- The registered email (admin) -------------------------------------------

export async function credentialView() {
  const credential = await loadCredential();
  return {
    registeredEmail: credential?.registeredEmail ?? null,
    hasToken: Boolean(credential?.apiToken),
    tokenUpdatedAt: credential?.apiTokenUpdatedAt ?? null,
  };
}

// A new email drops the token issued to the old one.
export async function setRegisteredEmail(registeredEmail: string) {
  await db.insert(bakongCredentials)
    .values({ id: 'default', registeredEmail })
    .onConflictDoUpdate({
      target: bakongCredentials.id,
      set: { registeredEmail, apiToken: null, apiTokenUpdatedAt: null },
    })
    .run();
  return credentialView();
}
