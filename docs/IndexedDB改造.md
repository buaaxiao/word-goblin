一、为什么要改
现状
用户数据（章节、单词统计、历史）存在 localStorage

localStorage 有硬限制：5 MB

只支持字符串，每次读写都要 JSON.stringify / JSON.parse

同步 API，大 JSON 序列化会阻塞主线程

没有事务、没有索引、没有结构化查询

无法存二进制（图片、音频等）

现状的隐患
隐患	影响
5 MB 上限	词库大或历史多时会 QuotaExceededError，数据写入失败
同步阻塞	几千词 + 几百条历史时，每次 saveData() 可能卡顿 100ms+
无事务	并发写可能覆盖，导致数据丢失
字符串序列化开销	每次保存都要 JSON.stringify 整个 data，I/O 密集
无索引	查询靠 Array.filter，数据大时性能差
IndexedDB 的优势
容量大：几十 MB ~ 几百 MB（取决于浏览器和用户设置）

结构化：直接存对象，不需手动 JSON.stringify

异步：不阻塞主线程

事务：保证一致性

索引：按字段快速查询

支持二进制：Blob、ArrayBuffer、File

二、改造收益
维度	localStorage 现状	IndexedDB 改造后
容量	5 MB 硬限制	几十 MB ~ 几百 MB
存对象	需手动 stringify / parse	直接存
写性能	全量序列化，几百 KB 都要重写	增量 diff，只写变化的记录
读性能	全量 parse	按需读取，可用索引
阻塞	同步，主线程卡顿	异步，不卡
事务	❌	✅
索引	❌	✅
二进制	❌	✅
file:// 兼容	✅	✅
多标签页并发	可能覆盖	事务隔离
一句话：容量翻几十倍，性能提升明显，代码结构更清晰。

三、架构设计
┌──────────────────────────────────────────────────────┐
│  服务端 / GitHub 仓库                                 │
│  data.json  ← 共享词库（发布、传输、备份）            │
└──────────────────┬───────────────────────────────────┘
                   │ fetch（只读）
                   ↓
┌──────────────────────────────────────────────────────┐
│  浏览器                                               │
│                                                       │
│  localStorage                                         │
│  ├── 去重开关 / 折叠状态 / 主题 / 报词方式            │
│  └── （可选）data.json 缓存 + 版本号                  │
│                                                       │
│  IndexedDB：wordGoblinLocal（唯一数据库）             │
│  ├── chapters  ← 章节（selected、dictLang、order）    │
│  ├── words     ← 单词（统计、日期、均分）             │
│  └── history   ← 默写历史                             │
│                                                       │
│  内存 data.chapters = 合并结果                        │
└──────────────────────────────────────────────────────┘
关键决策：

不建 wordGoblinCloud：data.json 直接 fetch，不需要额外缓存数据库

data.json 保留：作为共享词库的唯一交换格式

只建一个 IndexedDB：wordGoblinLocal，存所有用户数据

四、IndexedDB 数据库设计
数据库名：wordGoblinLocal
版本：1

对象仓库
仓库名	主键	索引	说明
chapters	id (string)	order、name	章节
words	id (string)	chapterId、text	单词
history	id (string)	date	默写历史
数据结构
chapters：

javascript
{
  id: 'ch_xxx',
  name: '四年级上册·观潮',
  selected: true,
  dictLang: 1,
  order: 0
}
words：

javascript
{
  id: 'w_xxx',
  chapterId: 'ch_xxx',
  text: '奇观',
  meaning: 'qíguān',
  wrongCount: 0,
  correctCount: 2,
  lastErrorDate: '',
  lastCorrectDate: '2025-09-19',
  scoreCount: 2,
  scoreSum: 200
}
history：

javascript
{
  id: 'h_xxx',
  date: '2025-09-19 14:30',
  chapters: '四年级上册·观潮',
  total: 10,
  wrongCount: 1,
  score: 90
}

五、新增 js/db.js
javascript
/* ===================================================================
 * js/db.js — IndexedDB 封装
 *   数据库：wordGoblinLocal
 *   对象仓库：chapters / words / history
 * =================================================================== */

const DB_NAME = 'wordGoblinLocal';
const DB_VERSION = 1;

let __dbPromise = null;

/* ===== 打开 / 初始化 ===== */
function openDB() {
  if (__dbPromise) return __dbPromise;
  __dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('chapters')) {
        const store = db.createObjectStore('chapters', { keyPath: 'id' });
        store.createIndex('order', 'order', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('words')) {
        const store = db.createObjectStore('words', { keyPath: 'id' });
        store.createIndex('chapterId', 'chapterId', { unique: false });
        store.createIndex('text', 'text', { unique: false });
      }
      if (!db.objectStoreNames.contains('history')) {
        const store = db.createObjectStore('history', { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
    };

    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
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
    try { result = fn(store); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('事务中止'));
  });
}

function genId(prefix) {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ===== 章节 ===== */
async function dbGetAllChapters() {
  return dbTx('chapters', 'readonly', store => {
    const result = [];
    store.openCursor().onsuccess = e => {
      const c = e.target.result;
      if (c) { result.push(c.value); c.continue(); }
    };
    return new Promise(res => setTimeout(() => res(result), 0));
  });
}
async function dbPutChapter(ch) { return dbTx('chapters', 'readwrite', s => s.put(ch)); }
async function dbDeleteChapter(id) { return dbTx('chapters', 'readwrite', s => s.delete(id)); }
async function dbClearChapters() { return dbTx('chapters', 'readwrite', s => s.clear()); }

/* ===== 单词 ===== */
async function dbGetAllWords() {
  return dbTx('words', 'readonly', store => {
    const result = [];
    store.openCursor().onsuccess = e => {
      const c = e.target.result;
      if (c) { result.push(c.value); c.continue(); }
    };
    return new Promise(res => setTimeout(() => res(result), 0));
  });
}
async function dbGetWordsByChapter(chapterId) {
  return dbTx('words', 'readonly', store => {
    const index = store.index('chapterId');
    const result = [];
    index.openCursor(IDBKeyRange.only(chapterId)).onsuccess = e => {
      const c = e.target.result;
      if (c) { result.push(c.value); c.continue(); }
    };
    return new Promise(res => setTimeout(() => res(result), 0));
  });
}
async function dbPutWord(w) { return dbTx('words', 'readwrite', s => s.put(w)); }
async function dbDeleteWord(id) { return dbTx('words', 'readwrite', s => s.delete(id)); }
async function dbClearWords() { return dbTx('words', 'readwrite', s => s.clear()); }

/* ===== 历史 ===== */
async function dbGetAllHistory() {
  return dbTx('history', 'readonly', store => {
    const result = [];
    store.openCursor().onsuccess = e => {
      const c = e.target.result;
      if (c) { result.push(c.value); c.continue(); }
    };
    return new Promise(res => setTimeout(() => res(result), 0));
  });
}
async function dbPutHistory(h) { return dbTx('history', 'readwrite', s => s.put(h)); }
async function dbClearHistory() { return dbTx('history', 'readwrite', s => s.clear()); }

/* ===== 全清 ===== */
async function dbClearAll() {
  await dbClearChapters();
  await dbClearWords();
  await dbClearHistory();
}
六、重写 js/storage.js
javascript
/* ===================================================================
 * js/storage.js — 数据加载 / 保存（IndexedDB 版）
 *   data.json：共享词库（fetch）
 *   wordGoblinLocal：用户数据（IndexedDB）
 * =================================================================== */

const STORAGE_KEY_OLD = 'wordDictation.data.v1';
const MIGRATED_FLAG = 'wordDictation.migrated.v1';

let data = { chapters: [], history: [] };

/* =================================================================
 * 一、首次迁移：localStorage → IndexedDB
 * ================================================================= */
async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATED_FLAG) === '1') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OLD);
    if (raw) {
      const old = JSON.parse(raw);
      if (old && Array.isArray(old.chapters)) {
        let order = 0;
        for (const ch of old.chapters) {
          const chapterId = genId('ch_');
          await dbPutChapter({
            id: chapterId,
            name: ch.name,
            selected: !!ch.selected,
            dictLang: typeof ch.dictLang === 'number' ? ch.dictLang : 0,
            order: order++
          });
          for (const w of ch.words || []) {
            await dbPutWord({
              id: genId('w_'),
              chapterId,
              text: w.text || '',
              meaning: w.meaning || '',
              wrongCount: w.wrongCount || 0,
              correctCount: w.correctCount || 0,
              lastErrorDate: w.lastErrorDate || '',
              lastCorrectDate: w.lastCorrectDate || '',
              scoreCount: w.scoreCount || 0,
              scoreSum: w.scoreSum || 0
            });
          }
        }
        if (Array.isArray(old.history)) {
          for (const h of old.history) {
            await dbPutHistory({
              id: genId('h_'),
              date: h.date || '',
              chapters: h.chapters || '',
              total: h.total || 0,
              wrongCount: h.wrongCount || 0,
              score: h.score || 0
            });
          }
        }
      }
    }
    localStorage.setItem(MIGRATED_FLAG, '1');
  } catch (e) {
    console.error('迁移旧数据失败：', e);
  }
}

/* =================================================================
 * 二、加载：data.json + wordGoblinLocal → 内存 data.chapters
 * ================================================================= */
async function loadData() {
  try {
    await migrateFromLocalStorage();

    // 1. 拉共享词库
    let cloud = { chapters: [] };
    try {
      const res = await fetch('data.json?_=' + Date.now(), { cache: 'no-store' });
      if (res.ok) cloud = await res.json();
    } catch (e) {
      console.warn('[cloud] fetch 失败，使用本地缓存：', e);
    }

    // 2. 读本地用户数据
    const localChapters = await dbGetAllChapters();
    const localWords = await dbGetAllWords();
    const localHistory = await dbGetAllHistory();

    // 3. 建立索引
    const localChapterByName = new Map();
    localChapters.forEach(c => localChapterByName.set(c.name, c));

    const localWordsByChapterId = new Map();
    localWords.forEach(w => {
      if (!localWordsByChapterId.has(w.chapterId)) localWordsByChapterId.set(w.chapterId, []);
      localWordsByChapterId.get(w.chapterId).push(w);
    });

    // 4. 合并：共享词库提供 name / dictLang / text / meaning；本地提供 selected / 统计
    const merged = [];

    for (const cch of (cloud.chapters || [])) {
      const localCh = localChapterByName.get(cch.name);
      const localChWords = localCh ? (localWordsByChapterId.get(localCh.id) || []) : [];
      const localWordByText = new Map(localChWords.map(w => [w.text, w]));

      merged.push({
        _id: localCh ? localCh.id : null,
        name: cch.name,
        dictLang: typeof cch.dictLang === 'number' ? cch.dictLang : (localCh ? localCh.dictLang : 0),
        selected: localCh ? !!localCh.selected : false,
        words: (cch.words || []).map(cw => {
          const lw = localWordByText.get(cw.text);
          return {
            _id: lw ? lw.id : null,
            text: cw.text,
            meaning: cw.meaning,
            wrongCount: lw ? lw.wrongCount : 0,
            correctCount: lw ? lw.correctCount : 0,
            lastErrorDate: lw ? lw.lastErrorDate : '',
            lastCorrectDate: lw ? lw.lastCorrectDate : '',
            scoreCount: lw ? lw.scoreCount : 0,
            scoreSum: lw ? lw.scoreSum : 0
          };
        })
      });
    }

    // 5. 本地独有章节（用户新增、共享里没有）
    for (const lc of localChapters) {
      if (!(cloud.chapters || []).some(cch => cch.name === lc.name)) {
        const lw = localWordsByChapterId.get(lc.id) || [];
        merged.push({
          _id: lc.id,
          name: lc.name,
          dictLang: typeof lc.dictLang === 'number' ? lc.dictLang : 0,
          selected: !!lc.selected,
          words: lw.map(w => ({
            _id: w.id,
            text: w.text,
            meaning: w.meaning,
            wrongCount: w.wrongCount,
            correctCount: w.correctCount,
            lastErrorDate: w.lastErrorDate,
            lastCorrectDate: w.lastCorrectDate,
            scoreCount: w.scoreCount,
            scoreSum: w.scoreSum
          }))
        });
      }
    }

    data.chapters = merged;

    // 6. 历史
    localHistory.sort((a, b) => (a.date > b.date ? 1 : -1));
    data.history = localHistory.map(h => ({
      _id: h.id,
      date: h.date,
      chapters: h.chapters,
      total: h.total,
      wrongCount: h.wrongCount,
      score: h.score
    }));
  } catch (e) {
    console.error('loadData 失败：', e);
    data = { chapters: [], history: [] };
  }
}

/* =================================================================
 * 三、保存：内存 data → IndexedDB（增量 diff）
 * ================================================================= */
async function saveData() {
  try {
    const dbChapters = await dbGetAllChapters();
    const keptChapterIds = new Set();
    let order = 0;

    // 1. 章节
    for (const ch of data.chapters) {
      let id = ch._id;
      if (!id) { id = genId('ch_'); ch._id = id; }
      keptChapterIds.add(id);
      await dbPutChapter({
        id,
        name: ch.name,
        selected: !!ch.selected,
        dictLang: typeof ch.dictLang === 'number' ? ch.dictLang : 0,
        order: order++
      });
    }
    for (const c of dbChapters) {
      if (!keptChapterIds.has(c.id)) {
        await dbDeleteChapter(c.id);
        const ws = await dbGetWordsByChapter(c.id);
        for (const w of ws) await dbDeleteWord(w.id);
      }
    }

    // 2. 单词
    const dbWords = await dbGetAllWords();
    const keptWordIds = new Set();
    for (const ch of data.chapters) {
      for (const w of ch.words) {
        let id = w._id;
        if (!id) { id = genId('w_'); w._id = id; }
        keptWordIds.add(id);
        await dbPutWord({
          id,
          chapterId: ch._id,
          text: w.text || '',
          meaning: w.meaning || '',
          wrongCount: w.wrongCount || 0,
          correctCount: w.correctCount || 0,
          lastErrorDate: w.lastErrorDate || '',
          lastCorrectDate: w.lastCorrectDate || '',
          scoreCount: w.scoreCount || 0,
          scoreSum: w.scoreSum || 0
        });
      }
    }
    for (const w of dbWords) {
      if (!keptWordIds.has(w.id)) await dbDeleteWord(w.id);
    }

    // 3. 历史
    const dbHistory = await dbGetAllHistory();
    const keptHistoryIds = new Set();
    for (const h of (data.history || [])) {
      let id = h._id;
      if (!id) { id = genId('h_'); h._id = id; }
      keptHistoryIds.add(id);
      await dbPutHistory({
        id,
        date: h.date || '',
        chapters: h.chapters || '',
        total: h.total || 0,
        wrongCount: h.wrongCount || 0,
        score: h.score || 0
      });
    }
    for (const h of dbHistory) {
      if (!keptHistoryIds.has(h.id)) {
        await dbTx('history', 'readwrite', s => s.delete(h.id));
      }
    }
  } catch (e) {
    console.error('saveData 失败：', e);
  }
}

/* =================================================================
 * 四、清空历史
 * ================================================================= */
async function clearHistory() {
  data.history = [];
  await dbClearHistory();
  renderHistory();
  renderChart();
  toast('历史已清空');
}

/* =================================================================
 * 五、全清（调试用）
 * ================================================================= */
async function clearAllData() {
  await dbClearAll();
  data = { chapters: [], history: [] };
  await saveData();
}
七、改造 js/main.js
initApp() 改成 async，await loadData()：

javascript
async function initApp() {
  try {
    // 1. 数据加载（异步）
    if (typeof loadData === 'function') await loadData();

    // 2. 小配置
    if (typeof loadDedupe === 'function') loadDedupe();
    if (typeof loadCollapseState === 'function') loadCollapseState();
    if (typeof loadLangSelSetting === 'function') loadLangSelSetting();

    if (typeof applyCollapseState === 'function') applyCollapseState();

    // 3. listVisibleSet
    if (typeof initListVisibleSet === 'function') initListVisibleSet();

    // 4. 渲染
    if (typeof renderChapterList === 'function') renderChapterList();
    if (typeof renderWords === 'function') renderWords();
    if (typeof updateStats === 'function') updateStats();

    // 5. 事件
    if (typeof bindGlobalEvents === 'function') bindGlobalEvents();

    // 6. 打字机
    if (typeof initChapterSearchHint === 'function') initChapterSearchHint();

    console.log('[单词精灵] 初始化完成');
  } catch (e) {
    console.error('initApp 失败：', e);
  }
}

(function boot() {
  document.body.classList.add('preload');

  try { injectPartials(); }
  catch (e) { console.error('注入弹窗 HTML 失败：', e); }

  initApp().finally(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove('preload');
      });
    });
  });
})();
八、改造 js/io.js
1. 替换 doSyncFromCloud() 并新增 mergeCloudIntoLocal()
javascript
async function doSyncFromCloud() {
  if (location.protocol === 'file:') {
    toast('本地文件模式下不支持同步，请用 HTTP 服务器访问');
    return;
  }

  try {
    const res = await fetch('data.json?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const cloud = await res.json();

    await mergeCloudIntoLocal(cloud);
    await loadData();

    renderChapterList();
    renderWords();
    updateStats();
    if (typeof updateChapterHeaderCheckbox === 'function') updateChapterHeaderCheckbox();

    toast('同步完成');
  } catch (e) {
    console.error('同步失败：', e);
    toast('同步失败：' + (e && e.message ? e.message : e));
  }
}

// 把共享词库合并进 wordGoblinLocal（保留 selected / 统计）
async function mergeCloudIntoLocal(cloud) {
  const localChapters = await dbGetAllChapters();
  const localWords = await dbGetAllWords();
  const localChapterByName = new Map(localChapters.map(c => [c.name, c]));

  for (const cch of (cloud.chapters || [])) {
    const localCh = localChapterByName.get(cch.name);
    const chapterId = localCh ? localCh.id : genId('ch_');

    await dbPutChapter({
      id: chapterId,
      name: cch.name,
      selected: localCh ? !!localCh.selected : false,
      dictLang: typeof cch.dictLang === 'number'
        ? cch.dictLang
        : (localCh ? localCh.dictLang : 0),
      order: localCh ? localCh.order : 0
    });

    const localWordsOfCh = localCh ? localWords.filter(w => w.chapterId === localCh.id) : [];
    const localWordByText = new Map(localWordsOfCh.map(w => [w.text, w]));

    for (const cw of (cch.words || [])) {
      const lw = localWordByText.get(cw.text);
      await dbPutWord({
        id: lw ? lw.id : genId('w_'),
        chapterId,
        text: cw.text,
        meaning: cw.meaning,
        wrongCount: lw ? lw.wrongCount : 0,
        correctCount: lw ? lw.correctCount : 0,
        lastErrorDate: lw ? lw.lastErrorDate : '',
        lastCorrectDate: lw ? lw.lastCorrectDate : '',
        scoreCount: lw ? lw.scoreCount : 0,
        scoreSum: lw ? lw.scoreSum : 0
      });
    }
  }
}
2. doImportMerge() 里 saveData() 前不需要额外处理（自动分配 _id）
保持不变，saveData() 会自动为新章节/单词生成 _id。

3. exportData() 保持不变，仍然导出 JSON
九、改造 js/reports.js
删除 clearHistory()（由 storage.js 提供异步版本）。

javascript
// ❌ 删除以下函数
function clearHistory() {
  data.history = [];
  saveData();
  renderHistory();
  renderChart();
  toast('历史已清空');
}
renderHistory / renderChart 保持不变。

十、修改 index.html
在 <head> 之后、storage.js 之前新增 js/db.js：

html
<script src="js/core.js"></script>
<script src="js/db.js"></script>            <!-- ★ 新增 -->
<script src="js/storage.js"></script>
<script src="js/reports.js"></script>
<script src="js/words.js"></script>
<script src="js/chapters.js"></script>
<script src="js/chapters-modals.js"></script>
<script src="js/chapters-search.js"></script>
<script src="js/io.js"></script>
<script src="js/dictation.js"></script>
<script src="js/main.js"></script>
十一、改动清单
文件	改动
js/db.js	新增：IndexedDB 封装
js/storage.js	重写：loadData / saveData 走 IndexedDB；首次自动迁移
js/main.js	initApp() 改 async，await loadData()
js/io.js	doSyncFromCloud() 改成「fetch → mergeCloudIntoLocal → loadData」；新增 mergeCloudIntoLocal()
js/reports.js	删除 clearHistory()
js/words.js / js/chapters.js	不改
js/dictation.js	不改
index.html	引入 js/db.js
data.json	保留（共享词库载体）
十二、验证清单
1. 首次打开（localStorage 有旧数据）
✅ 数据自动从 localStorage 迁移到 wordGoblinLocal

✅ 章节、单词、历史全部显示

✅ DevTools → Application → IndexedDB → wordGoblinLocal 有数据

2. 修改数据（勾选、标记对错、默写）
✅ 只写 wordGoblinLocal

✅ 刷新页面数据仍在

3. 点「同步」
✅ fetch('data.json') → 合并 → 写 wordGoblinLocal

✅ 用户勾选、统计、历史保留

4. 导入 / 导出
✅ 导出仍是 .json 文件

✅ 导入后写入 wordGoblinLocal

5. 断网测试
✅ fetch('data.json') 失败 → 用本地已有数据

✅ 用户操作不受影响

6. file:// 协议
✅ IndexedDB 可用

✅ fetch('data.json') 被 CORS 拦 → 走本地已有数据

7. DevTools 验证
javascript
// 查看所有数据库
indexedDB.databases().then(console.log)

// 查看 wordGoblinLocal
const req = indexedDB.open('wordGoblinLocal');
req.onsuccess = e => {
  const db = e.target.result;
  console.log('object stores:', [...db.objectStoreNames]);
};
十三、注意事项
IndexedDB 是异步的：loadData() 必须 await，initApp() 改成 async。

data.json 保留：作为共享词库的发布 / 传输 / 备份格式。

首次迁移自动进行：localStorage 里的旧数据自动搬到 IndexedDB，无需用户操作。

保存走增量 diff：saveData() 对比 IndexedDB 与内存，只写变化的记录，几百条数据下耗时毫秒级。

_id 字段：内存里的 data.chapters[i]._id 和 words[j]._id 是 IndexedDB 主键；saveData() 自动分配。

不需要 wordGoblinCloud：data.json 直接 fetch，HTTP 缓存已足够；本地已有上次合并的数据，断网也能用。

file:// 兼容：IndexedDB 不受 CORS 限制，本地双击 index.html 也能正常读写数据。

清空历史：reports.js 里的 clearHistory() 要删除，避免与 storage.js 的同名函数冲突。

迁移标志：wordDictation.migrated.v1 记录是否已迁移。若想重新迁移，可在 Console 里执行 localStorage.removeItem('wordDictation.migrated.v1') 后刷新。

十四、总结
IndexedDB 化 = 用户数据从 localStorage 迁到 wordGoblinLocal，data.json 保留为共享词库的唯一载体。

核心流程：

打开页面：fetch('data.json') + wordGoblinLocal → 合并 → 内存 data.chapters

用户操作：只写 wordGoblinLocal

点同步：重新 fetch → 合并 → 写 wordGoblinLocal

断网 / file://：用本地已有数据

主要收益：

容量从 5 MB 提升到几十 MB+

结构化存储，无需手动 JSON 序列化

异步、事务、索引，性能与可靠性大幅提升

首次自动迁移，用户无感

不需要 wordGoblinCloud——它只是 data.json 的缓存，浏览器 HTTP 缓存 + 本地已有数据已足够。

