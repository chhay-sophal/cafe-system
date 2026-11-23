import { ref } from "vue";
import { HttpError, submitOrder } from "../lib/api";
import {
  enqueueOrder,
  getQueuedOrders,
  removeQueuedOrder,
  updateQueuedOrder,
  type QueuedOrder,
} from "../lib/offlineDb";
import { useAuth } from "./useAuth";
import { useSalesHistory } from "./useSalesHistory";
import type { OrderPayload } from "../types/order";

// Responses that say nothing about the sale itself - the backend, or a proxy
// in front of it, briefly unavailable or overloaded - so they're treated like
// being offline: stop this batch and retry later.
const TRANSIENT_STATUSES = new Set([408, 429, 502, 503, 504]);

// A sale the backend keeps failing with a 500 is unlikely to ever go through
// (e.g. a product it references has since been deleted) - after this many
// tries it stops being retried automatically and is handed to staff.
const MAX_SERVER_ERROR_ATTEMPTS = 5;

const pendingCount = ref(0);
const failedOrders = ref<QueuedOrder[]>([]);
let isSyncing = false;

function byQueueTime(a: QueuedOrder, b: QueuedOrder): number {
  return a.createdAt - b.createdAt;
}

async function refreshQueueState() {
  const queued = await getQueuedOrders();
  pendingCount.value = queued.filter((entry) => entry.status !== "failed").length;
  failedOrders.value = queued.filter((entry) => entry.status === "failed").sort(byQueueTime);
}

refreshQueueState();

async function enqueue(payload: OrderPayload): Promise<void> {
  const session = useAuth().session.value;
  await enqueueOrder(
    payload,
    session ? { token: session.token, tokenExpiresAt: session.expiresAt, cashierName: session.user.name } : {},
  );
  await refreshQueueState();
}

// The login of the cashier who rang the sale up comes first, while it's still
// valid, so the sale is recorded under them; the current login is the
// fallback once theirs has expired (or been revoked).
function tokensFor(entry: QueuedOrder): string[] {
  const tokens: string[] = [];
  if (entry.token && entry.tokenExpiresAt && Date.parse(entry.tokenExpiresAt) > Date.now()) {
    tokens.push(entry.token);
  }
  const current = useAuth().session.value?.token;
  if (current && !tokens.includes(current)) {
    tokens.push(current);
  }
  return tokens;
}

async function submitEntry(entry: QueuedOrder, tokens: string[]): Promise<void> {
  // Entries queued before clientOrderId existed fall back to their queue id,
  // which is just as stable across retries.
  const payload = { ...entry.payload, clientOrderId: entry.payload.clientOrderId ?? entry.id };

  for (const [index, token] of tokens.entries()) {
    try {
      await submitOrder(payload, token);
      return;
    } catch (error) {
      const isLastToken = index === tokens.length - 1;
      if (error instanceof HttpError && error.status === 401 && !isLastToken) {
        continue;
      }
      throw error;
    }
  }
}

async function syncPending(): Promise<void> {
  if (isSyncing) {
    return;
  }

  isSyncing = true;

  try {
    // Oldest first, so offline sales get their order numbers in the order
    // they were rung up (IndexedDB returns them by their random id).
    const queued = (await getQueuedOrders()).filter((entry) => entry.status !== "failed").sort(byQueueTime);

    for (const entry of queued) {
      const tokens = tokensFor(entry);
      if (tokens.length === 0) {
        // Its cashier's login has expired and nobody is logged in - it goes
        // with the next login.
        continue;
      }

      try {
        await submitEntry(entry, tokens);
        useSalesHistory().invalidate();
        await removeQueuedOrder(entry.id);
      } catch (error) {
        if (!(error instanceof HttpError) || TRANSIENT_STATUSES.has(error.status)) {
          // Still unreachable - stop this batch and let the next trigger retry.
          break;
        }

        if (error.status === 401) {
          // No login the server accepts right now - api.ts has already logged
          // out a rejected current session. Keep it for the next login.
          continue;
        }

        // Rejected outright (4xx), or failing on the server for good (5xx,
        // repeatedly): retrying on a timer won't help, so set it aside for
        // staff to review rather than retrying it forever. Never dropped - the
        // money for it has already been taken.
        const attempts = entry.attempts + 1;
        const giveUp = error.status < 500 || attempts >= MAX_SERVER_ERROR_ATTEMPTS;
        await updateQueuedOrder(entry.id, {
          attempts,
          lastError: error.message,
          ...(giveUp ? { status: "failed" as const } : {}),
        });
      }
    }
  } finally {
    await refreshQueueState();
    isSyncing = false;
  }
}

// Staff asked to try a failed sale again (e.g. after fixing the product it
// referenced). It goes back into the normal queue, so if the server is
// unreachable right now it keeps retrying automatically like any other.
async function retryFailed(id: string): Promise<void> {
  await updateQueuedOrder(id, { status: "pending", attempts: 0 });
  await refreshQueueState();
  await syncPending();
}

// A manager decided a failed sale shouldn't be recorded at all.
async function discardFailed(id: string): Promise<void> {
  await removeQueuedOrder(id);
  await refreshQueueState();
}

export function useOfflineQueue() {
  return { pendingCount, failedOrders, enqueue, syncPending, retryFailed, discardFailed };
}
