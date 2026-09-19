/* ===================================================================
 * js/io.js — 数据导入 / 导出 / 同步
 *
 * 依赖：
 *   - core.js       : $, toast
 *   - storage.js    : data, saveData
 *   - chapters.js   : renderChapterList, initListVisibleSet
 *   - words.js      : renderWords
 *   - reports.js    : updateStats
 *   - main.js       : openModal, closeModal
 * =================================================================== */

// ===================================================================
// 二、导出
// ===================================================================
function confirmExport() {
  openConfirmModal({
    title: "导出数据",
    body: "确定导出当前数据吗？",
    okTitle: "导出",
    onOk: function () {
      console.log("[导入] onOk 被调用，incoming =", incoming);
      exportData();
    },
  });
}

function exportData() {
  try {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: data,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const ts = formatTimestamp(new Date());
    const filename = "word-goblin-" + ts + ".json";

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast("已导出：" + filename);
  } catch (e) {
    console.error("导出失败：", e);
    toast("导出失败：" + (e && e.message ? e.message : e));
  }
}

function formatTimestamp(d) {
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

// ===================================================================
// 三、导入
// ===================================================================
function importData() {
  const input = document.getElementById("fileInput");
  if (!input) return;

  input.onchange = null;
  input.value = "";

  input.onchange = function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const raw = ev.target.result;
        const parsed = JSON.parse(raw);
        const incoming = parsed && parsed.data ? parsed.data : parsed;
        if (!incoming || !Array.isArray(incoming.chapters)) {
          toast("文件格式不正确：缺少 chapters");
          return;
        }

        openConfirmModal({
          title: "导入数据",
          body:
            "检测到 <b>" +
            incoming.chapters.length +
            "</b> 个章节。<br>" +
            "将采用「合并」方式导入：<br>" +
            "· 本地独有的章节和单词会保留<br>" +
            "· 新章节会追加<br>" +
            "· 同名章节按单词去重合并",
          okTitle: "导入",
          onOk: function () {
            return doImportMerge(incoming);
          },
        });
      } catch (err) {
        console.error("解析失败：", err);
        toast("文件解析失败：" + (err && err.message ? err.message : err));
      } finally {
        input.value = "";
      }
    };
    reader.onerror = function () {
      toast("读取文件失败");
      input.value = "";
    };
    reader.readAsText(file);
  };

  input.click();
}

// 合并导入
function doImportMerge(incoming) {
  console.log(
    "[导入] 开始",
    incoming && incoming.chapters && incoming.chapters.length,
  );
  try {
    const current = data.chapters || [];
    const byName = new Map();
    current.forEach((ch) => byName.set(ch.name, ch));

    let addedCh = 0,
      addedWord = 0,
      mergedWord = 0,
      skippedWord = 0,
      filledWord = 0;
    const mergeDetail = [];

    incoming.chapters.forEach((ch) => {
      const name = (ch.name || "").trim();
      if (!name) return;

      if (!byName.has(name)) {
        // ===== 新章节：直接追加 =====
        const newCh = {
          name: name,
          selected: false,
          words: Array.isArray(ch.words) ? ch.words.map(normalizeWord) : [],
        };
        current.push(newCh);
        byName.set(name, newCh);
        addedCh++;
        addedWord += newCh.words.length;
      } else {
        // ===== 同名章节：按 text 去重 + 补空字段 =====
        const target = byName.get(name);
        if (!Array.isArray(target.words)) target.words = [];

        // text → 本地词对象，便于 O(1) 查找
        const wordMap = new Map();
        target.words.forEach((w) => {
          const t = (w.text || "").trim();
          if (t) wordMap.set(t, w);
        });

        let chAdded = 0,
          chSkipped = 0,
          chFilled = 0;

        (ch.words || []).forEach((w) => {
          const t = (w.text || "").trim();
          if (!t) return;

          if (wordMap.has(t)) {
            // ★ 重复：保留本地，只补本地为空、导入有值的"描述性"字段
            const local = wordMap.get(t);
            let filled = false;

            if (!local.meaning && w.meaning) {
              local.meaning = (w.meaning || "").trim();
              filled = true;
            }

            // 如需补其他描述性字段，仿照上面继续加：
            // if (!local.phonetic && w.phonetic) {
            //   local.phonetic = (w.phonetic || "").trim();
            //   filled = true;
            // }

            // ★ 统计字段一律不动：
            // wrongCount / correctCount / lastErrorDate / lastCorrectDate
            // scoreCount / scoreSum 全部保留本地

            chSkipped++;
            if (filled) chFilled++;
            return;
          }

          // ===== 新词：normalizeWord 后追加 =====
          const normalized = normalizeWord(w);
          target.words.push(normalized);
          wordMap.set(t, normalized);
          chAdded++;
        });

        mergedWord += chAdded;
        skippedWord += chSkipped;
        filledWord += chFilled;

        mergeDetail.push({
          name,
          added: chAdded,
          skipped: chSkipped,
          filled: chFilled,
        });
      }
    });

    // ★ 同步 listVisibleSet：新增章节默认未选中，不影响；
    //    但若原有 selected 被外部数据覆盖，需要重建
    if (typeof initListVisibleSet === "function") initListVisibleSet();

    saveData();
    renderChapterList();
    renderWords();
    updateStats();

    // ===== 结果反馈：始终弹窗 =====
    const summary =
      "✅ 导入完成" +
      (addedCh ? "：新增 " + addedCh + " 章 · " + addedWord + " 词" : "") +
      (mergedWord || skippedWord
        ? (addedCh ? "；" : "：") +
          "合并 " +
          mergedWord +
          " 词" +
          (skippedWord ? " · 跳过 " + skippedWord + " 重复词" : "") +
          (filledWord ? " · 补全 " + filledWord + " 个释义" : "")
        : "");

    let detailHtml = "<p style='margin:0 0 8px;'>" + esc(summary) + "</p>";

    if (mergeDetail.length > 0) {
      detailHtml +=
        "<p style='margin:0 0 6px;color:var(--text-soft);font-size:13px;'>合并明细：</p>" +
        "<ul style='margin:0 0 0 18px;padding:0;font-size:13px;color:var(--text-soft);line-height:1.7;'>" +
        mergeDetail
          .map((d) => {
            const parts = [];
            if (d.added) parts.push("新增 " + d.added + " 词");
            if (d.skipped) parts.push("跳过 " + d.skipped + " 重复");
            if (d.filled) parts.push("补全 " + d.filled + " 个释义");
            if (!parts.length) parts.push("无变化");
            return "<li>「" + esc(d.name) + "」" + parts.join(" · ") + "</li>";
          })
          .join("") +
        "</ul>";
    }

    console.log("[导入] 准备弹窗", {
      addedCh,
      addedWord,
      mergedWord,
      skippedWord,
      filledWord,
      detailCount: mergeDetail.length,
      summary,
    });
    openModal(
      "导入结果",
      detailHtml +
        '<div class="row" style="justify-content:center;margin-top:16px;">' +
        '<button class="primary" onclick="closeModal()">知道了</button>' +
        "</div>",
    );
    console.log("[导入] openModal 已调用");

    return false;
  } catch (e) {
    console.error("[导入] 异常：", e);
    console.error("导入失败：", e);
    toast("导入失败：" + (e && e.message ? e.message : e));
    return false;
  }
}

function normalizeWord(w) {
  return {
    text: (w.text || "").trim(),
    meaning: (w.meaning || "").trim(),
    wrongCount: w.wrongCount || 0,
    correctCount: w.correctCount || 0,
    lastErrorDate: w.lastErrorDate || "",
    lastCorrectDate: w.lastCorrectDate || "",
    scoreCount: w.scoreCount || 0,
    scoreSum: w.scoreSum || 0,
  };
}

// ===================================================================
// 四、数据同步
// ===================================================================
function syncFromCloud() {
  openConfirmModal({
    title: "☁️ 云端同步",
    body:
      '<div style="color:var(--text-soft);font-size:14px;line-height:1.7;">' +
      '将从 <b style="color:var(--primary);">云端</b> 同步词库：<br>' +
      "· 本地独有的章节和单词会保留<br>" +
      "· 云端独有的章节会追加<br>" +
      "· 同名章节按单词去重合并" +
      "</div>" +
      '<div style="margin-top:10px;padding:8px 12px;background:var(--primary-light);' +
      'border-radius:8px;color:var(--primary);font-size:13px;font-weight:600;">' +
      "📡 此操作需要网络连接" +
      "</div>",
    danger: true,
    okTitle: "同步",
    onOk: doSyncFromCloud,
  });
}

async function doSyncFromCloud() {
  if (location.protocol === "file:") {
    toast("本地文件模式下不支持同步，请用 HTTP 服务器访问");
    return;
  }

  try {
    const res = await fetch(getDataUrl(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const cloud = await res.json();

    await mergeCloudIntoLocal(cloud);
    await loadData();

    renderChapterList();
    renderWords();
    updateStats();
    if (typeof updateChapterHeaderCheckbox === "function")
      updateChapterHeaderCheckbox();

    toast("同步完成");
  } catch (e) {
    console.error("同步失败：", e);
    toast("同步失败：" + (e && e.message ? e.message : e));
  }
}

// 把共享词库合并进 wordGoblinLocal（保留 selected / 统计）
async function mergeCloudIntoLocal(cloud) {
  const localChapters = await dbGetAllChapters();
  const localWords = await dbGetAllWords();
  const localChapterByName = new Map(localChapters.map((c) => [c.name, c]));

  for (const cch of cloud.chapters || []) {
    const localCh = localChapterByName.get(cch.name);
    const chapterId = localCh ? localCh.id : genId("ch_");

    await dbPutChapter({
      id: chapterId,
      name: cch.name,
      selected: localCh ? !!localCh.selected : false,
      dictLang: normalizeDictLang(
        typeof cch.dictLang === "number"
          ? cch.dictLang
          : localCh
            ? localCh.dictLang
            : DICT_LANG.EN,
      ),
      order: localCh ? localCh.order : 0,
    });

    const localWordsOfCh = localCh
      ? localWords.filter((w) => w.chapterId === localCh.id)
      : [];
    const localWordByText = new Map(localWordsOfCh.map((w) => [w.text, w]));

    for (const cw of cch.words || []) {
      const lw = localWordByText.get(cw.text);
      await dbPutWord({
        id: lw ? lw.id : genId("w_"),
        chapterId,
        text: cw.text,
        meaning: cw.meaning,
        wrongCount: lw ? lw.wrongCount : 0,
        correctCount: lw ? lw.correctCount : 0,
        lastErrorDate: lw ? lw.lastErrorDate : "",
        lastCorrectDate: lw ? lw.lastCorrectDate : "",
        scoreCount: lw ? lw.scoreCount : 0,
        scoreSum: lw ? lw.scoreSum : 0,
      });
    }
  }
}
