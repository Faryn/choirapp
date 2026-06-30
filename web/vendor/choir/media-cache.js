(function () {
  const DB_NAME = 'choir-app-audio-cache';
  const DB_VERSION = 2;
  const AUDIO_STORE = 'audio-files';
  const PDF_STORE = 'score-pdfs';
  const STORE_BUDGET_BYTES = {
    [AUDIO_STORE]: 350 * 1024 * 1024,
    [PDF_STORE]: 80 * 1024 * 1024,
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const storeName of [AUDIO_STORE, PDF_STORE]) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'key' });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function recordSize(record) {
    return Number(record?.byteLength || record?.arrayBuffer?.byteLength || 0);
  }

  async function get(storeName, key) {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  }

  async function put(storeName, record, { trim = true } = {}) {
    const db = await openDb();
    const normalized = {
      ...record,
      byteLength: recordSize(record),
      lastUsedAt: Date.now(),
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(normalized);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    if (trim) await trimStore(storeName);
  }

  async function trimStore(storeName) {
    const maxBytes = STORE_BUDGET_BYTES[storeName];
    if (!maxBytes) return;

    const db = await openDb();
    const entries = [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const value = cursor.value || {};
        entries.push({
          key: cursor.key,
          size: recordSize(value),
          lastUsedAt: Number(value.lastUsedAt || value.cachedAt || 0),
        });
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });

    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total <= maxBytes) return;

    entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    const keysToDelete = [];
    for (const entry of entries) {
      if (total <= maxBytes) break;
      keysToDelete.push(entry.key);
      total -= entry.size;
    }
    if (!keysToDelete.length) return;

    const deleteDb = await openDb();
    await new Promise((resolve, reject) => {
      const tx = deleteDb.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      keysToDelete.forEach((key) => store.delete(key));
      tx.oncomplete = () => {
        deleteDb.close();
        resolve();
      };
      tx.onerror = () => {
        deleteDb.close();
        reject(tx.error);
      };
    });
  }

  window.ChoirMediaCache = Object.freeze({
    AUDIO_STORE,
    PDF_STORE,
    get,
    put,
    trimStore,
    recordSize,
    getAudio: (key) => get(AUDIO_STORE, key),
    putAudio: (record, options) => put(AUDIO_STORE, record, options),
    getPdf: (key) => get(PDF_STORE, key),
    putPdf: (record, options) => put(PDF_STORE, record, options),
  });
})();
