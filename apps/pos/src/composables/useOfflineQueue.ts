import { ref } from "vue";
import { HttpError, submitOrder } from "../lib/api";
import { enqueueOrder, getQueuedOrders, removeQueuedOrder, updateQueuedOrder } from "../lib/offlineDb";
import { useAuth } from "./useAuth";
import type { OrderPayload } from "../types/order";

const pendingCount = ref(0);
let isSyncing = false;

async function refreshPendingCount() {
  const queued = await getQueuedOrders();
  pendingCount.value = queued.length;
}

refreshPendingCount();

async function enqueue(payload: OrderPayload): Promise<void> {
  await enqueueOrder(payload);
  await refreshPendingCount();
}

async function syncPending(): Promise<void> {
  if (isSyncing) {
    return;
  }

  const auth = useAuth();
  const token = auth.session.value?.token;
  if (!token) {
    return;
  }

  isSyncing = true;

  try {
    const queued = await getQueuedOrders();

    for (const entry of queued) {
      try {
        await submitOrder(entry.payload, token);
        await removeQueuedOrder(entry.id);
      } catch (error) {
        if (error instanceof HttpError) {
          // Server reached but rejected the request (e.g. expired session) -
          // leave it queued for the next sync rather than losing the sale.
          await updateQueuedOrder(entry.id, {
            attempts: entry.attempts + 1,
            lastError: error.message,
          });
          continue;
        }

        // Still unreachable - stop this batch and let the next trigger retry.
        break;
      }
    }
  } finally {
    await refreshPendingCount();
    isSyncing = false;
  }
}

export function useOfflineQueue() {
  return { pendingCount, enqueue, syncPending };
}
