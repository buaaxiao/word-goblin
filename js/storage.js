/* ===================================================================
 * js/storage.js — 数据加载 / 保存（IndexedDB 版）
 *   data.json：共享词库（fetch）
 *   wordGoblinLocal：用户数据（IndexedDB）
 *   sessionStorage 增量哨兵：防止 IndexedDB 异步写入未完成就被刷新
 *
 *   ★ 所有"本地-共享"匹配走 uid（id 字段），不再用 name
 *   ★ 兼容历史数据（无 uid）：用 name 认领，认领后立刻写回 IDB
 *   ★ dictLang 统一用 DICT_LANG 枚举（0=EN, 1=ZH）
 * =================================================================== */

const STORAGE_KEY_OLD = "wordDictation.data.v1";
const MIGRATED_FLAG = "wordDictation.migrated.v1";
const PENDING_KEY = "wordDictation.pending.v1";

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
 * 二、加载：data.json + wordGoblinLocal → 内存 data.chapters
 *   匹配规则（按优先级）：
 *     1) uid 相同           → 用本地记录（本地优先）
 *     2) uid 不同、name 相同 → 认领：把本地 uid 改成共享 uid，写回 IDB
 *     3) 都匹配不上         → 共享章节新增；本地章节保留为"本地独有"
 * ================================================================= */
async function loadData() {
  try {
    // 0. 先检查 sessionStorage 增量哨兵
    let pending = null;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) pending = JSON.parse(raw);
    } catch (e) {
      console.warn("[loadData] 读取 sessionStorage 哨兵失败：", e);
    }

    if (pending && (pending.chapters || pending.words || pending.history)) {
      console.warn("[loadData] 发现未提交的保存（增量哨兵），先回写 IDB");
      try {
        await applyPendingToIDB(pending);
        sessionStorage.removeItem(PENDING_KEY);
        console.log("[loadData] 增量哨兵已回写 IDB 并清除");
      } catch (e) {
        console.error("[loadData] 增量哨兵回写 IDB 失败：", e);
      }
    }

    await migrateFromLocalStorage();

    // 1. 拉共享词库
    let cloud = { chapters: [] };
    try {
      const res = await fetch(getDataUrl(), {
        cache: "no-store",
      });
      if (res.ok) cloud = await res.json();
    } catch (e) {
      console.warn("[cloud] fetch 失败，使用本地缓存：", e);
    }

    // 2. 读本地用户数据
    const localChapters = await dbGetAllChapters();
    const localWords = await dbGetAllWords();
    const localHistory = await dbGetAllHistory();

    // 3. 建本地索引：id 和 name 两份（name 用于"认领"历史数据）
    const localChapterById = new Map();
    const localChapterByName = new Map();
    localChapters.forEach((c) => {
      localChapterById.set(c.id, c);
      if (!localChapterByName.has(c.name)) localChapterByName.set(c.name, c);
    });

    const localWordsByChapterId = new Map();
    localWords.forEach((w) => {
      if (!localWordsByChapterId.has(w.chapterId))
        localWordsByChapterId.set(w.chapterId, []);
      localWordsByChapterId.get(w.chapterId).push(w);
    });

    // 4. 合并（uid 匹配 + name 认领）
    const merged = [];
    const usedLocalChapterIds = new Set();

    for (const cch of cloud.chapters || []) {
      // ★ 共享章节必须有 uid；没跑迁移脚本时用 name 兜底
      const cchId = cch.id || "ch_shared_" + encodeURIComponent(cch.name);

      // 4.1 章节匹配：先 id，后 name（认领）
      let localCh = localChapterById.get(cchId);
      let needClaim = false;
      if (!localCh) {
        const byName = localChapterByName.get(cch.name);
        if (byName) {
          localCh = byName;
          needClaim = true; // ★ 认领：本地记录要改成共享 uid
        }
      }

      if (localCh) usedLocalChapterIds.add(localCh.id);

      // 4.2 单词匹配：先 id，后 text（认领）
      const localChWords = localCh
        ? localWordsByChapterId.get(localCh.id) || []
        : [];
      const localWordById = new Map(localChWords.map((w) => [w.id, w]));
      const localWordByText = new Map(localChWords.map((w) => [w.text, w]));
      const claimedWordIds = []; // 本次认领的单词（旧 id 列表）

      const mergedWords = [];
      for (const cw of cch.words || []) {
        const cwId = cw.id || "w_shared_" + encodeURIComponent(cw.text);

        let lw = localWordById.get(cwId);
        let wordClaim = false;
        if (!lw) {
          const byText = localWordByText.get(cw.text);
          if (byText) {
            lw = byText;
            wordClaim = true;
          }
        }

        if (wordClaim && lw) {
          claimedWordIds.push({ oldId: lw.id, newId: cwId, rec: lw });
        }

        mergedWords.push({
          _id: cwId,
          text: lw ? lw.text : cw.text,
          meaning: lw ? lw.meaning : cw.meaning,
          wrongCount: lw ? lw.wrongCount : 0,
          correctCount: lw ? lw.correctCount : 0,
          lastErrorDate: lw ? lw.lastErrorDate : "",
          lastCorrectDate: lw ? lw.lastCorrectDate : "",
          scoreCount: lw ? lw.scoreCount : 0,
          scoreSum: lw ? lw.scoreSum : 0,
        });
      }

      merged.push({
        _id: cchId,
        name: localCh ? localCh.name : cch.name,
        dictLang: normalizeDictLang(
          localCh
            ? typeof localCh.dictLang === "number"
              ? localCh.dictLang
              : DICT_LANG.EN
            : typeof cch.dictLang === "number"
              ? cch.dictLang
              : DICT_LANG.EN,
        ),
        selected: localCh ? !!localCh.selected : false,
        words: mergedWords,
      });

      // 4.3 认领：把本地旧 uid 改成共享 uid（写回 IDB）
      if (needClaim && localCh) {
        try {
          await dbDeleteChapter(localCh.id);
          await dbPutChapter({
            id: cchId,
            name: localCh.name,
            selected: !!localCh.selected,
            dictLang: normalizeDictLang(
              typeof localCh.dictLang === "number"
                ? localCh.dictLang
                : DICT_LANG.EN,
            ),
            order: localCh.order || 0,
          });
        } catch (e) {
          console.error("[loadData] 认领章节写回失败：", e);
        }
      }
      if (claimedWordIds.length) {
        for (const { oldId, newId, rec } of claimedWordIds) {
          try {
            await dbDeleteWord(oldId);
            await dbPutWord({
              id: newId,
              chapterId: cchId,
              text: rec.text || "",
              meaning: rec.meaning || "",
              wrongCount: rec.wrongCount || 0,
              correctCount: rec.correctCount || 0,
              lastErrorDate: rec.lastErrorDate || "",
              lastCorrectDate: rec.lastCorrectDate || "",
              scoreCount: rec.scoreCount || 0,
              scoreSum: rec.scoreSum || 0,
            });
          } catch (e) {
            console.error("[loadData] 认领单词写回失败：", e);
          }
        }
      }
    }

    // 5. 本地独有章节（共享词库里没有对应 uid 的）
    for (const lc of localChapters) {
      if (usedLocalChapterIds.has(lc.id)) continue;
      const lw = localWordsByChapterId.get(lc.id) || [];
      merged.push({
        _id: lc.id,
        name: lc.name,
        dictLang: normalizeDictLang(
          typeof lc.dictLang === "number" ? lc.dictLang : DICT_LANG.EN,
        ),
        selected: !!lc.selected,
        words: lw.map((w) => ({
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
      });
    }

    data.chapters = merged;

    // 6. 历史
    localHistory.sort((a, b) => (a.date > b.date ? 1 : -1));
    data.history = localHistory.map((h) => ({
      _id: h.id,
      date: h.date,
      chapters: h.chapters,
      total: h.total,
      wrongCount: h.wrongCount,
      score: h.score,
    }));
  } catch (e) {
    console.error("loadData 失败：", e);
    data = { chapters: [], history: [] };
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
        const ws = await dbGetWordsByChapter(c.id);
        for (const w of ws) {
          await dbDeleteWord(w.id);
          changed.deleted.words.push(w.id);
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
 *   ★ dictLang 比较用 normalizeDictLang 规范化，避免 0 vs "0" 的坑
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
