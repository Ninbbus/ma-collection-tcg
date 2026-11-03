// Stockage local de la collection (IndexedDB, avec repli localStorage).
// Toute la collection tient dans un seul objet, sauvegardé à chaque modification.
(function () {
  const DB_NAME = "classeur-tcg";
  const STORE = "kv";
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function get(key) {
    const db = await openDB();
    if (!db) {
      try { return JSON.parse(localStorage.getItem(`${DB_NAME}:${key}`)); } catch { return null; }
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async function set(key, value) {
    const db = await openDB();
    if (!db) {
      try { localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value)); } catch {}
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  let timer = null;
  let pending = null;
  function saveSoon(key, value) {
    pending = { key, value };
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }
  async function flush() {
    if (!pending) return;
    const { key, value } = pending;
    pending = null;
    try { await set(key, value); } catch (e) { console.error("Sauvegarde impossible", e); }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

  async function persist() {
    try {
      if (navigator.storage?.persist) return await navigator.storage.persist();
    } catch {}
    return false;
  }

  window.Store = { get, set, saveSoon, flush, persist };
})();
