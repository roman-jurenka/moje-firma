// ─── Odolnost appky proti výpadku signálu v terénu ─────────────────────────
// Docházka, kniha jízd, fotky a podpisy se dřív zapisovaly přímo do Supabase
// bez ošetření chyby — když v terénu vypadl signál, zápis tiše zmizel a
// člověk nevěděl, že se nic neuložilo (viz audit appky, bod 7).
//
// Tohle je jednoduchá klientská fronta nad IndexedDB (zvládne uložit i
// soubory/fotky, ne jen text): když síťový zápis selže kvůli výpadku
// připojení, záznam se místo tichého zahození uloží do fronty v zařízení a
// zkusí se poslat znovu automaticky, jakmile se připojení obnoví (событie
// "online", návrat do appky, nebo pravidelně na pozadí), případně ručně přes
// tlačítko v appce. Skutečné chyby appky (špatná data, chybějící oprávnění)
// se do fronty NEukládají — ty se rovnou ukážou uživateli, protože opakování
// by je stejně nevyřešilo.

const DB_NAME = "proudos_offline";
const DB_VERSION = 1;
const STORE = "queue";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  const store = tx.objectStore(STORE);
  const result = await fn(store);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const listeners = new Set();
export function subscribeOfflineQueue(fn) {
  listeners.add(fn);
  listOfflineQueue().then(fn).catch(() => {});
  return () => listeners.delete(fn);
}
function notifyListeners() {
  listOfflineQueue().then(q => listeners.forEach(fn => fn(q))).catch(() => {});
}

export async function enqueueOfflineWrite(kind, label, payload) {
  const id = await withStore("readwrite", (store) =>
    reqToPromise(store.add({ kind, label, payload, createdAt: Date.now(), attempts: 0 }))
  );
  notifyListeners();
  return id;
}

export async function listOfflineQueue() {
  try {
    return await withStore("readonly", (store) => reqToPromise(store.getAll()));
  } catch {
    return [];
  }
}

async function removeFromQueue(id) {
  await withStore("readwrite", (store) => reqToPromise(store.delete(id)));
  notifyListeners();
}

async function bumpAttempts(item, errMsg) {
  await withStore("readwrite", (store) =>
    reqToPromise(store.put({ ...item, attempts: (item.attempts || 0) + 1, lastError: errMsg, lastTryAt: Date.now() }))
  );
  notifyListeners();
}

// Rozezná výpadek sítě od skutečné chyby appky (validace, chybějící
// oprávnění apod.) — jen síťové chyby mají smysl opakovat automaticky.
export function isLikelyNetworkError(e) {
  if (!e) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String(e.message || e).toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed")
    || msg.includes("load failed") || (e.name === "TypeError" && msg.includes("fetch"));
}

// Zkusí zápis rovnou; pokud selže na síti, uloží ho do fronty místo toho, aby
// se ztratil. Vrací { ok: true, result } při rovnou úspěšném zápisu, nebo
// { ok: false, queued: true } když se uložilo jen do fronty. Skutečné (ne
// síťové) chyby se vyhodí dál, ať je volající ukáže uživateli jako dřív.
export async function tryOrQueue(kind, label, payload, directRun) {
  try {
    const result = await directRun(payload);
    return { ok: true, result };
  } catch (e) {
    if (isLikelyNetworkError(e)) {
      await enqueueOfflineWrite(kind, label, payload);
      return { ok: false, queued: true, error: e };
    }
    throw e;
  }
}

let handlers = {};
export function registerOfflineHandlers(map) {
  handlers = { ...handlers, ...map };
}

let flushing = false;
export async function flushOfflineQueue(onAnyFlushed) {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  let flushedAny = false;
  try {
    const items = await listOfflineQueue();
    for (const item of items) {
      const handler = handlers[item.kind];
      if (!handler) continue;
      try {
        await handler(item.payload);
        await removeFromQueue(item.id);
        flushedAny = true;
      } catch (e) {
        await bumpAttempts(item, String(e?.message || e));
        if (isLikelyNetworkError(e)) break; // signál pořád nefunguje, další položky teď nemá smysl zkoušet
      }
    }
  } finally {
    flushing = false;
    notifyListeners();
    if (flushedAny && onAnyFlushed) onAnyFlushed();
  }
}

let initialized = false;
export function initOfflineSync(handlerMap, onAnyFlushed) {
  registerOfflineHandlers(handlerMap);
  if (initialized) { flushOfflineQueue(onAnyFlushed); return; }
  initialized = true;
  window.addEventListener("online", () => flushOfflineQueue(onAnyFlushed));
  window.addEventListener("focus", () => flushOfflineQueue(onAnyFlushed));
  setInterval(() => flushOfflineQueue(onAnyFlushed), 30000);
  flushOfflineQueue(onAnyFlushed);
}

export async function retryOfflineQueueNow() {
  await flushOfflineQueue();
}
