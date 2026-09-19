/* ===================================================================
 * js/storage.js — 数据加载 / 保存（IndexedDB 版）
 *   data.json：共享词库（fetch）
 *   wordGoblinLocal：用户数据（IndexedDB）
 * =================================================================== */

const STORAGE_KEY_OLD = "wordDictation.data.v1";
const MIGRATED_FLAG = "wordDictation.migrated.v1";

let data = { chapters: [], history: [] };
let currentChapter = 0;

/* =================================================================
 * 一、首次迁移：localStorage → IndexedDB
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
          const chapterId = genId("ch_");
          await dbPutChapter({
            id: chapterId,
            name: ch.name,
            selected: !!ch.selected,
            dictLang: typeof ch.dictLang === "number" ? ch.dictLang : 0,
            order: order++,
          });
          for (const w of ch.words || []) {
            await dbPutWord({
              id: genId("w_"),
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
              id: genId("h_"),
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
 * ================================================================= */
async function loadData() {
  try {
    await migrateFromLocalStorage();

    // 1. 拉共享词库
    let cloud = { chapters: [] };
    try {
      const res = await fetch("data.json?_=" + Date.now(), {
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

    // 3. 建立索引
    const localChapterByName = new Map();
    localChapters.forEach((c) => localChapterByName.set(c.name, c));

    const localWordsByChapterId = new Map();
    localWords.forEach((w) => {
      if (!localWordsByChapterId.has(w.chapterId))
        localWordsByChapterId.set(w.chapterId, []);
      localWordsByChapterId.get(w.chapterId).push(w);
    });

    // 4. 合并：共享词库提供 name / dictLang / text / meaning；本地提供 selected / 统计
    const merged = [];

    for (const cch of cloud.chapters || []) {
      const localCh = localChapterByName.get(cch.name);
      const localChWords = localCh
        ? localWordsByChapterId.get(localCh.id) || []
        : [];
      const localWordByText = new Map(localChWords.map((w) => [w.text, w]));

      merged.push({
        _id: localCh ? localCh.id : null,
        name: cch.name,
        dictLang:
          typeof cch.dictLang === "number"
            ? cch.dictLang
            : localCh
              ? localCh.dictLang
              : 0,
        selected: localCh ? !!localCh.selected : false,
        words: (cch.words || []).map((cw) => {
          const lw = localWordByText.get(cw.text);
          return {
            _id: lw ? lw.id : null,
            text: cw.text,
            meaning: cw.meaning,
            wrongCount: lw ? lw.wrongCount : 0,
            correctCount: lw ? lw.correctCount : 0,
            lastErrorDate: lw ? lw.lastErrorDate : "",
            lastCorrectDate: lw ? lw.lastCorrectDate : "",
            scoreCount: lw ? lw.scoreCount : 0,
            scoreSum: lw ? lw.scoreSum : 0,
          };
        }),
      });
    }

    // 5. 本地独有章节（用户新增、共享里没有）
    for (const lc of localChapters) {
      if (!(cloud.chapters || []).some((cch) => cch.name === lc.name)) {
        const lw = localWordsByChapterId.get(lc.id) || [];
        merged.push({
          _id: lc.id,
          name: lc.name,
          dictLang: typeof lc.dictLang === "number" ? lc.dictLang : 0,
          selected: !!lc.selected,
          words: lw.map((w) => ({
            _id: w.id,
            text: w.text,
            meaning: w.meaning,
            wrongCount: w.wrongCount,
            correctCount: w.correctCount,
            lastErrorDate: w.lastErrorDate,
            lastCorrectDate: w.lastCorrectDate,
            scoreCount: w.scoreCount,
            scoreSum: w.scoreSum,
          })),
        });
      }
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
      if (!id) {
        id = genId("ch_");
        ch._id = id;
      }
      keptChapterIds.add(id);
      await dbPutChapter({
        id,
        name: ch.name,
        selected: !!ch.selected,
        dictLang: typeof ch.dictLang === "number" ? ch.dictLang : 0,
        order: order++,
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
        if (!id) {
          id = genId("w_");
          w._id = id;
        }
        keptWordIds.add(id);
        await dbPutWord({
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
        });
      }
    }
    for (const w of dbWords) {
      if (!keptWordIds.has(w.id)) await dbDeleteWord(w.id);
    }

    // 3. 历史
    const dbHistory = await dbGetAllHistory();
    const keptHistoryIds = new Set();
    for (const h of data.history || []) {
      let id = h._id;
      if (!id) {
        id = genId("h_");
        h._id = id;
      }
      keptHistoryIds.add(id);
      await dbPutHistory({
        id,
        date: h.date || "",
        chapters: h.chapters || "",
        total: h.total || 0,
        wrongCount: h.wrongCount || 0,
        score: h.score || 0,
      });
    }
    for (const h of dbHistory) {
      if (!keptHistoryIds.has(h.id)) {
        await dbTx("history", "readwrite", (s) => s.delete(h.id));
      }
    }
  } catch (e) {
    console.error("saveData 失败：", e);
  }
}

/* =================================================================
 * 五、全清（调试用）
 * ================================================================= */
async function clearAllData() {
  await dbClearAll();
  data = { chapters: [], history: [] };
  await saveData();
}
