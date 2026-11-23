/// <reference lib="esnext" />
// Raw site answers (HTML, PDF, QFX) kept in IndexedDB of mykplan.adp.com, key = step key ("tx/day/2024-06-14.html").
// The memory store is the same contract for tests
export interface RawEntry { key: string; type: string; savedAt: string; text?: string; bytes?: Uint8Array }

export interface RawStore {
  has(key: string): Promise<boolean>;
  get(key: string): Promise<RawEntry | undefined>;
  put(entry: RawEntry): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export function memoryStore(): RawStore & { map: Map<string, RawEntry> } {
  const map = new Map<string, RawEntry>();
  return {
    map,
    has: async (k) => map.has(k),
    get: async (k) => map.get(k),
    put: async (e) => void map.set(e.key, e),
    delete: async (k) => void map.delete(k),
    keys: async (prefix = '') => Array.from(map.keys()).filter((k) => k.startsWith(prefix)).sort(),
  };
}

const DB = 'mykplan-adp-raw';
const STORE = 'raw';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function call<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export function indexedDbStore(): RawStore {
  let db: Promise<IDBDatabase> | null = null;
  const get = () => (db ??= open());
  return {
    has: async (k) => (await call<number>(await get(), 'readonly', (s) => s.count(k))) > 0,
    get: async (k) => call<RawEntry | undefined>(await get(), 'readonly', (s) => s.get(k)),
    put: async (e) => void (await call(await get(), 'readwrite', (s) => s.put(e))),
    delete: async (k) => void (await call(await get(), 'readwrite', (s) => s.delete(k))),
    keys: async (prefix = '') => (await call<IDBValidKey[]>(await get(), 'readonly', (s) => s.getAllKeys())).map(String).filter((k) => k.startsWith(prefix)).sort(),
  };
}
