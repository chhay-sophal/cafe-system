import type { OrderPayload } from "../types/order";

export interface QueuedOrder {
  id: string;
  payload: OrderPayload;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const DB_NAME = "cafe-pos-offline";
const DB_VERSION = 1;
const STORE_NAME = "pendingOrders";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOrder(payload: OrderPayload): Promise<string> {
  const entry: QueuedOrder = {
    id: crypto.randomUUID(),
    // Vue's reactive Proxies (cart line items live inside a ref array) can't
    // survive IndexedDB's structured-clone algorithm, so strip them to plain
    // JSON-safe data before persisting - OrderPayload is plain data anyway.
    payload: JSON.parse(JSON.stringify(payload)),
    createdAt: Date.now(),
    attempts: 0,
  };

  await withStore("readwrite", (store) => store.add(entry));
  return entry.id;
}

export function getQueuedOrders(): Promise<QueuedOrder[]> {
  return withStore("readonly", (store) => store.getAll());
}

export async function removeQueuedOrder(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function updateQueuedOrder(id: string, patch: Partial<QueuedOrder>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as QueuedOrder | undefined;
      if (!existing) {
        resolve();
        return;
      }

      const putRequest = store.put({ ...existing, ...patch });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}
