/* ===================================================================
 * js/db.js — IndexedDB 封装
 *   数据库：wordGoblinLocal
 *   对象仓库：chapters / words / history / settings / logs
 * =================================================================== */

const DB_NAME = "wordGoblinLocal";
const DB_VERSION = 3; // ★ 1 → 2：新增 settings store；2 → 3：新增 logs store

let __dbPromise = null;

/* ===== 打开 / 初始化 ===== */
function openDB() {
  if (__dbPromise) return __dbPromise;
  Log.info("db", "打开数据库 " + DB_NAME + " v" + DB_VERSION);
  __dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      Log.info("db", "检测到结构升级，开始建表…");

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
      // ★ 新增：logs store（运行日志，seq 自增主键，ts 索引）
      if (!db.objectStoreNames.contains("logs")) {
        const store = db.createObjectStore("logs", {
          keyPath: "seq",
          autoIncrement: true,
        });
        store.createIndex("ts", "ts", { unique: false });
      }

      Log.info("db", "结构升级完成，当前对象仓库：" +
          Array.from(db.objectStoreNames).join(" / "),);
    };

    req.onsuccess = (e) => {
      Log.info("db", "数据库就绪：v" + e.target.result.version);
      resolve(e.target.result);
    };
    req.onerror = (e) => {
      Log.error("db", "打开数据库失败：", e.target.error);
      reject(e.target.error);
    };
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
    tx.onerror = () => {
      // ★ logs 仓库不打印，避免「日志写失败 → 再记一条日志」的循环
      if (storeName !== "logs") {
        Log.error("db", "事务失败：" + storeName + " / " + mode, tx.error);
      }
      reject(tx.error);
    };
    tx.onabort = () => {
      if (storeName !== "logs") {
        Log.error("db", "事务中止：" + storeName + " / " + mode, tx.error);
      }
      reject(tx.error || new Error("事务中止"));
    };
  });
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

/* ===== 运行日志（logs store，供 js/logger.js 使用） ===== */
/** 批量写入日志（一次事务，减少 IO） */
async function dbPutLogs(entries) {
  if (!entries || !entries.length) return 0;
  return dbTx("logs", "readwrite", (s) => {
    entries.forEach((e) => s.put(e));
    return entries.length;
  });
}

/** 读取全部日志（按 seq 升序，即写入顺序） */
async function dbGetAllLogs() {
  return dbTx("logs", "readonly", (store) => {
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

/** 日志总条数 */
async function dbCountLogs() {
  return dbTx("logs", "readonly", (store) => {
    const req = store.count();
    return new Promise((res) => {
      req.onsuccess = () => res(req.result || 0);
      req.onerror = () => res(0);
    });
  });
}

/** 清空日志 */
async function dbClearLogs() {
  return dbTx("logs", "readwrite", (s) => s.clear());
}

/** 裁剪日志：只保留最新的 maxCount 条，返回删除条数（maxCount 为 0 时清空全部） */
async function dbPruneLogs(maxCount) {
  if (maxCount === undefined || maxCount === null || maxCount < 0) return 0;
  const total = await dbCountLogs();
  if (total <= maxCount) return 0;

  const overflow = total - maxCount;
  return dbTx("logs", "readwrite", (store) => {
    let removed = 0;
    store.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c && removed < overflow) {
        store.delete(c.key);
        removed++;
        c.continue();
      }
    };
    return new Promise((res) => setTimeout(() => res(removed), 0));
  });
}

/* ===== 全清（不包含 settings / logs，设置与日志独立管理） ===== */
async function dbClearAll() {
  Log.warn("db", "清空 chapters / words / history 三个对象仓库");
  await dbClearChapters();
  await dbClearWords();
  await dbClearHistory();
  Log.info("db", "数据仓库已清空");
}
