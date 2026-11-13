/**
 * Stores the most recent capture as a Blob in IndexedDB so the popup can copy it
 * again even after the service worker has been suspended. Shared by the
 * service worker (writer) and the popup (reader): same extension origin.
 */
import type { CaptureSummary } from './types';

const DB_NAME = 'pagesnap';
const STORE = 'results';
const KEY = 'latest';

export interface StoredResult {
  summary: CaptureSummary;
  blob: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function putResult(result: StoredResult): Promise<void> {
  await tx('readwrite', (s) => s.put(result, KEY));
}

export async function getResult(): Promise<StoredResult | undefined> {
  return (await tx<StoredResult | undefined>('readonly', (s) => s.get(KEY))) ?? undefined;
}

export async function clearResult(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
}
