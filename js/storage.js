/* ===================================================================
 * js/storage.js — 数据加载 / 保存（IndexedDB 版）
 *   data.json：共享词库（fetch，仅点击「同步」时拉取）
 *   wordGoblinLocal：用户数据（IndexedDB）
 *   sessionStorage 增量哨兵：防止 IndexedDB 异步写入未完成就被刷新
 *
 *   ★ 所有"本地-共享"匹配走 uid（id 字段），不再用 name
 *   ★ 兼容历史数据（无 uid）：用 name 认领，认领后立刻写回 IDB
 *   ★ dictLang 统一用 DICT_LANG 枚举（0=EN, 1=ZH）
 *   ★ 用户主动删除的 uid 记入黑名单，云端同步时不复活
 * =================================================================== */

const STORAGE_KEY_OLD = "wordDictation.data.v1";
const MIGRATED_FLAG = "wordDictation.migrated.v1";
const PENDING_KEY = "wordDictation.pending.v1";

/* =================================================================
 * 已删除 uid 黑名单（防止云端同步复活用户主动删除的章节/单词）
 * ================================================================= */
const DELETED_UIDS_KEY = "wordGoblin.deletedUids.v1";

function loadDeletedUids() {
  try {
    const raw = localStorage.getItem(DELETED_UIDS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

function _saveDeletedUids(set) {
  try {
    localStorage.setItem(DELETED_UIDS_KEY, JSON.stringify([...set]));
  } catch (e) {}
}

function addDeletedUid(uid) {
  if (!uid) return;
  const s = loadDeletedUids();
  s.add(uid);
  _saveDeletedUids(s);
}

function removeDeletedUid(uid) {
  if (!uid) return;
  const s = loadDeletedUids();
  if (!s.has(uid)) return;
  s.delete(uid);
  _saveDeletedUids(s);
}

let data = { chapters: [], history: [] };
let currentChapter = 0;

/* =================================================================
 * 一、首次迁移：localStorage v1 → IndexedDB（旧数据自动生成 uid）
 * ================================================================= */
async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATED_FLAG) === "1") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OLD);
    if (raw) {
      const old = JSON.parse(raw);
      if (old && Array.isArray(old.chapters)) {
        let order = 0;
        for (const ch of old.chapters) {
          const chapterId = ch.id || genId("ch_");
          await dbPutChapter({
            id: chapterId,
            name: ch.name,
            selected: !!ch.selected,
            dictLang: normalizeDictLang(
              typeof ch.dictLang === "number" ? ch.dictLang : DICT_LANG.EN,
            ),
            order: order++,
          });
          for (const w of ch.words || []) {
            await dbPutWord({
              id: w.id || genId("w_"),
              chapterId,
              text: w.text || "",
              meaning: w.meaning || "",
              wrongCount: w.wrongCount || 0,
              correctCount: w.correctCount || 0,
              lastErrorDate: w.lastErrorDate || "",
              lastCorrectDate: w.lastCorrectDate || "",
              scoreCount: w.scoreCount || 0,
              scoreSum: w.scoreSum || 0,
            });
          }
        }
        if (Array.isArray(old.history)) {
          for (const h of old.history) {
            await dbPutHistory({
              id: h.id || genId("h_"),
              date: h.date || "",
              chapters: h.chapters || "",
              total: h.total || 0,
              wrongCount: h.wrongCount || 0,
              score: h.score || 0,
            });
          }
        }
      }
    }
    localStorage.setItem(MIGRATED_FLAG, "1");
  } catch (e) {
    console.error("迁移旧数据失败：", e);
  }
}

/* =================================================================
 * 二、加载：只读本地 IndexedDB（云端合并仅在「同步」时）
 * ================================================================= */
async function loadData() {
  try {
    // 0. sessionStorage 哨兵（保留：处理未提交的本地写）
    let pending = null;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) pending = JSON.parse(raw);
    } catch (e) {
      console.warn("[loadData] 读取 sessionStorage 哨兵失败：", e);
    }
    if (pending && (pending.chapters || pending.words || pending.history)) {
      try {
        await applyPendingToIDB(pending);
        sessionStorage.removeItem(PENDING_KEY);
      } catch (e) {
        console.error("[loadData] 增量哨兵回写 IDB 失败：", e);
      }
    }

    await migrateFromLocalStorage();

    // ★ 只读本地，不再 fetch 云端
    const localChapters = await dbGetAllChapters();
    const localWords = await dbGetAllWords();
    const localHistory = await dbGetAllHistory();

    // 单词按章节分组
    const wordsByChapterId = new Map();
    localWords.forEach((w) => {
      if (!wordsByChapterId.has(w.chapterId))
        wordsByChapterId.set(w.chapterId, []);
      wordsByChapterId.get(w.chapterId).push(w);
    });

    // 章节按 order 排
    const sortedChapters = [...localChapters].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    data.chapters = sortedChapters.map((c) => ({
      _id: c.id,
      name: c.name,
      selected: !!c.selected,
      dictLang: normalizeDictLang(
        typeof c.dictLang === "number" ? c.dictLang : DICT_LANG.EN,
      ),
      words: (wordsByChapterId.get(c.id) || []).map((w) => ({
        _id: w.id,
        text: w.text || "",
        meaning: w.meaning || "",
        wrongCount: w.wrongCount || 0,
        correctCount: w.correctCount || 0,
        lastErrorDate: w.lastErrorDate || "",
        lastCorrectDate: w.lastCorrectDate || "",
        scoreCount: w.scoreCount || 0,
        scoreSum: w.scoreSum || 0,
      })),
    }));

    data.history = localHistory.map((h) => ({
      _id: h.id,
      date: h.date || "",
      chapters: h.chapters || "",
      total: h.total || 0,
      wrongCount: h.wrongCount || 0,
      score: h.score || 0,
    }));

    console.log("[loadData] 从本地 IDB 载入", data.chapters.length, "章节");
  } catch (e) {
    console.error("[loadData] 失败：", e);
  }
}

/* =================================================================
 * 三、把增量哨兵应用到 IndexedDB
 * ================================================================= */
async function applyPendingToIDB(pending) {
  const del = pending.deleted || {};

  for (const id of del.words || []) {
    try {
      await dbDeleteWord(id);
    } catch (e) {}
  }
  for (const id of del.chapters || []) {
    try {
      await dbDeleteChapter(id);
    } catch (e) {}
    try {
      const ws = await dbGetWordsByChapter(id);
      for (const w of ws) await dbDeleteWord(w.id);
    } catch (e) {}
  }
  for (const id of del.history || []) {
    try {
      await dbDeleteHistory(id);
    } catch (e) {}
  }

  for (const id of Object.keys(pending.chapters || {})) {
    try {
      await dbPutChapter(pending.chapters[id]);
    } catch (e) {}
  }
  for (const id of Object.keys(pending.words || {})) {
    try {
      await dbPutWord(pending.words[id]);
    } catch (e) {}
  }
  for (const id of Object.keys(pending.history || {})) {
    try {
      await dbPutHistory(pending.history[id]);
    } catch (e) {}
  }
}

/* =================================================================
 * 四、保存：内存 data → IndexedDB（增量 diff）
 *   ★ 章节/单词的 _id 已存在就复用，不重新生成
 *   ★ 删除时记录 uid 到黑名单；保留时清除黑名单
 * ================================================================= */
async function saveData() {
  const changed = {
    chapters: {},
    words: {},
    history: {},
    deleted: { chapters: [], words: [], history: [] },
    ts: Date.now(),
  };

  try {
    // ============ 1. 章节 ============
    const dbChapters = await dbGetAllChapters();
    const dbChapterById = new Map(dbChapters.map((c) => [c.id, c]));
    const keptChapterIds = new Set();
    let order = 0;

    for (const ch of data.chapters) {
      let id = ch._id;
      if (!id) {
        id = genId("ch_");
        ch._id = id;
      }
      keptChapterIds.add(id);
      removeDeletedUid(id); // ★ 保留 → 从黑名单移除

      const rec = {
        id,
        name: ch.name,
        selected: !!ch.selected,
        dictLang: normalizeDictLang(
          typeof ch.dictLang === "number" ? ch.dictLang : DICT_LANG.EN,
        ),
        order: order++,
      };

      const old = dbChapterById.get(id);
      if (!old || !shallowEqualChapter(old, rec)) {
        await dbPutChapter(rec);
        changed.chapters[id] = rec;
      }
    }
    for (const c of dbChapters) {
      if (!keptChapterIds.has(c.id)) {
        await dbDeleteChapter(c.id);
        changed.deleted.chapters.push(c.id);
        addDeletedUid(c.id); // ★ 删除 → 加入黑名单
        const ws = await dbGetWordsByChapter(c.id);
        for (const w of ws) {
          await dbDeleteWord(w.id);
          changed.deleted.words.push(w.id);
          addDeletedUid(w.id); // ★
        }
      }
    }

    // ============ 2. 单词 ============
    const dbWords = await dbGetAllWords();
    const dbWordById = new Map(dbWords.map((w) => [w.id, w]));
    const keptWordIds = new Set();

    for (const ch of data.chapters) {
      for (const w of ch.words) {
        let id = w._id;
        if (!id) {
          id = genId("w_");
          w._id = id;
        }
        keptWordIds.add(id);
        removeDeletedUid(id); // ★ 保留 → 从黑名单移除

        const rec = {
          id,
          chapterId: ch._id,
          text: w.text || "",
          meaning: w.meaning || "",
          wrongCount: w.wrongCount || 0,
          correctCount: w.correctCount || 0,
          lastErrorDate: w.lastErrorDate || "",
          lastCorrectDate: w.lastCorrectDate || "",
          scoreCount: w.scoreCount || 0,
          scoreSum: w.scoreSum || 0,
        };

        const old = dbWordById.get(id);
        if (!old || !shallowEqualWord(old, rec)) {
          await dbPutWord(rec);
          changed.words[id] = rec;
        }
      }
    }
    for (const w of dbWords) {
      if (!keptWordIds.has(w.id)) {
        await dbDeleteWord(w.id);
        changed.deleted.words.push(w.id);
        addDeletedUid(w.id); // ★ 删除 → 加入黑名单
      }
    }

    // ============ 3. 历史 ============
    const dbHistory = await dbGetAllHistory();
    const dbHistoryById = new Map(dbHistory.map((h) => [h.id, h]));
    const keptHistoryIds = new Set();

    for (const h of data.history || []) {
      let id = h._id;
      if (!id) {
        id = genId("h_");
        h._id = id;
      }
      keptHistoryIds.add(id);

      const rec = {
        id,
        date: h.date || "",
        chapters: h.chapters || "",
        total: h.total || 0,
        wrongCount: h.wrongCount || 0,
        score: h.score || 0,
      };

      const old = dbHistoryById.get(id);
      if (!old || !shallowEqualHistory(old, rec)) {
        await dbPutHistory(rec);
        changed.history[id] = rec;
      }
    }
    for (const h of dbHistory) {
      if (!keptHistoryIds.has(h.id)) {
        await dbDeleteHistory(h.id);
        changed.deleted.history.push(h.id);
      }
    }

    // ★ 全部写成功 → 清掉哨兵
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  } catch (e) {
    console.error("saveData 失败：", e);
    try {
      const prev = readPending();
      const merged = mergePending(prev, changed);
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(merged));
      console.warn("[saveData] 已写入增量哨兵，下次启动会恢复");
    } catch (err) {
      console.error("[saveData] 写增量哨兵失败：", err);
    }
  }
}

/* =================================================================
 * 五、sessionStorage 增量哨兵工具
 * ================================================================= */
function readPending() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function mergePending(prev, next) {
  const out = {
    chapters: Object.assign({}, prev && prev.chapters, next.chapters),
    words: Object.assign({}, prev && prev.words, next.words),
    history: Object.assign({}, prev && prev.history, next.history),
    deleted: {
      chapters: uniqConcat(
        prev && prev.deleted && prev.deleted.chapters,
        next.deleted.chapters,
      ),
      words: uniqConcat(
        prev && prev.deleted && prev.deleted.words,
        next.deleted.words,
      ),
      history: uniqConcat(
        prev && prev.deleted && prev.deleted.history,
        next.deleted.history,
      ),
    },
    ts: Date.now(),
  };
  out.deleted.chapters = out.deleted.chapters.filter((id) => !out.chapters[id]);
  out.deleted.words = out.deleted.words.filter((id) => !out.words[id]);
  out.deleted.history = out.deleted.history.filter((id) => !out.history[id]);
  return out;
}

function uniqConcat(a, b) {
  const set = new Set();
  (a || []).forEach((x) => set.add(x));
  (b || []).forEach((x) => set.add(x));
  return Array.from(set);
}

/* =================================================================
 * 六、浅比较工具
 * ================================================================= */
function shallowEqualChapter(a, b) {
  return (
    a.name === b.name &&
    !!a.selected === !!b.selected &&
    normalizeDictLang(a.dictLang) === normalizeDictLang(b.dictLang) &&
    (a.order || 0) === (b.order || 0)
  );
}
function shallowEqualWord(a, b) {
  return (
    a.chapterId === b.chapterId &&
    a.text === b.text &&
    a.meaning === b.meaning &&
    (a.wrongCount || 0) === (b.wrongCount || 0) &&
    (a.correctCount || 0) === (b.correctCount || 0) &&
    (a.lastErrorDate || "") === (b.lastErrorDate || "") &&
    (a.lastCorrectDate || "") === (b.lastCorrectDate || "") &&
    (a.scoreCount || 0) === (b.scoreCount || 0) &&
    (a.scoreSum || 0) === (b.scoreSum || 0)
  );
}
function shallowEqualHistory(a, b) {
  return (
    (a.date || "") === (b.date || "") &&
    (a.chapters || "") === (b.chapters || "") &&
    (a.total || 0) === (b.total || 0) &&
    (a.wrongCount || 0) === (b.wrongCount || 0) &&
    (a.score || 0) === (b.score || 0)
  );
}

/* =================================================================
 * 七、全清（调试用）
 * ================================================================= */
async function clearAllData() {
  await dbClearAll();
  data = { chapters: [], history: [] };
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch (e) {}
  await saveData();
}
