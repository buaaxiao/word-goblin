/* ===================================================================
 * js/db.js — IndexedDB 封装
 *   数据库：wordGoblinLocal
 *   对象仓库：chapters / words / history / settings
 * =================================================================== */

const DB_NAME = "wordGoblinLocal";
const DB_VERSION = 2; // ★ 1 → 2：新增 settings store

let __dbPromise = null;

/* ===== 打开 / 初始化 ===== */
function openDB() {
  if (__dbPromise) return __dbPromise;
  __dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains("chapters")) {
        const store = db.createObjectStore("chapters", { keyPath: "id" });
        store.createIndex("order", "order", { unique: false });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("shareName", "shareName", { unique: false });
      }
      if (!db.objectStoreNames.contains("words")) {
        const store = db.createObjectStore("words", { keyPath: "id" });
        store.createIndex("chapterId", "chapterId", { unique: false });
        store.createIndex("text", "text", { unique: false });
      }
      if (!db.objectStoreNames.contains("history")) {
        const store = db.createObjectStore("history", { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
      }
      // ★ 新增：settings store（key-value）
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return __dbPromise;
}

/* ===== 通用事务 ===== */
async function dbTx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try {
      result = fn(store);
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("事务中止"));
  });
}

function genId(prefix) {
  return (
    (prefix || "") +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

/* ===== 章节 ===== */
async function dbGetAllChapters() {
  return dbTx("chapters", "readonly", (store) => {
    const result = [];
    store.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        result.push(c.value);
        c.continue();
      }
    };
    return new Promise((res) => setTimeout(() => res(result), 0));
  });
}
async function dbPutChapter(ch) {
  return dbTx("chapters", "readwrite", (s) => s.put(ch));
}
async function dbDeleteChapter(id) {
  return dbTx("chapters", "readwrite", (s) => s.delete(id));
}
async function dbClearChapters() {
  return dbTx("chapters", "readwrite", (s) => s.clear());
}

/* ===== 单词 ===== */
async function dbGetAllWords() {
  return dbTx("words", "readonly", (store) => {
    const result = [];
    store.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        result.push(c.value);
        c.continue();
      }
    };
    return new Promise((res) => setTimeout(() => res(result), 0));
  });
}
async function dbGetWordsByChapter(chapterId) {
  return dbTx("words", "readonly", (store) => {
    const index = store.index("chapterId");
    const result = [];
    index.openCursor(IDBKeyRange.only(chapterId)).onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        result.push(c.value);
        c.continue();
      }
    };
    return new Promise((res) => setTimeout(() => res(result), 0));
  });
}
async function dbPutWord(w) {
  return dbTx("words", "readwrite", (s) => s.put(w));
}
async function dbDeleteWord(id) {
  return dbTx("words", "readwrite", (s) => s.delete(id));
}
async function dbClearWords() {
  return dbTx("words", "readwrite", (s) => s.clear());
}

/* ===== 历史 ===== */
async function dbGetAllHistory() {
  return dbTx("history", "readonly", (store) => {
    const result = [];
    store.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        result.push(c.value);
        c.continue();
      }
    };
    return new Promise((res) => setTimeout(() => res(result), 0));
  });
}
async function dbPutHistory(h) {
  return dbTx("history", "readwrite", (s) => s.put(h));
}
async function dbDeleteHistory(id) {
  return dbTx("history", "readwrite", (s) => s.delete(id));
}
async function dbClearHistory() {
  return dbTx("history", "readwrite", (s) => s.clear());
}

/* ===== 设置（settings store） ===== */
async function dbGetSetting(key) {
  return dbTx("settings", "readonly", (store) => {
    const req = store.get(key);
    return new Promise((res) => {
      req.onsuccess = () => res(req.result ? req.result.value : undefined);
      req.onerror = () => res(undefined);
    });
  });
}
async function dbPutSetting(key, value) {
  return dbTx("settings", "readwrite", (s) => s.put({ key, value }));
}
async function dbGetAllSettings() {
  return dbTx("settings", "readonly", (store) => {
    const result = [];
    store.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        result.push(c.value);
        c.continue();
      }
    };
    return new Promise((res) => setTimeout(() => res(result), 0));
  });
}
async function dbDeleteSetting(key) {
  return dbTx("settings", "readwrite", (s) => s.delete(key));
}

/* ===== 全清（不包含 settings，设置独立管理） ===== */
async function dbClearAll() {
  await dbClearChapters();
  await dbClearWords();
  await dbClearHistory();
}
