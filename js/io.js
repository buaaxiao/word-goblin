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
// 一、通用确认对话框
// ===================================================================
function confirmDialog(title, messageHtml, onOk, onCancel) {
  openModal(
    title,
    '<div style="color:var(--text-soft);font-size:14px;line-height:1.7;margin-bottom:6px;">' +
      messageHtml +
      "</div>" +
      '<div class="row" style="justify-content:flex-end;">' +
      '<button type="button" id="confirmDialogCancel">取消</button>' +
      '<button type="button" class="primary" id="confirmDialogOk">确定</button>' +
      "</div>",
  );

  const okBtn = document.getElementById("confirmDialogOk");
  const cancelBtn = document.getElementById("confirmDialogCancel");

  let finished = false;

  function finish(action) {
    if (finished) return;
    finished = true;
    document.removeEventListener("keydown", onKeyDown, true);
    closeModal();

    const cb = action === "ok" ? onOk : onCancel;
    if (typeof cb === "function") {
      try {
        cb();
      } catch (e) {
        console.error("confirmDialog " + action + " 失败：", e);
      }
    }
  }

  if (okBtn)
    okBtn.onclick = function () {
      finish("ok");
    };
  if (cancelBtn)
    cancelBtn.onclick = function () {
      finish("cancel");
    };

  function onKeyDown(e) {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "Enter") {
      e.preventDefault();
      finish("ok");
    }
  }
  document.addEventListener("keydown", onKeyDown, true);
}

// ===================================================================
// 二、导出
// ===================================================================
function confirmExport() {
  confirmDialog(
    "导出数据",
    "将当前全部章节与单词导出为 JSON 文件，可用于备份或迁移到其他设备。<br>" +
      "导出后文件会保存到浏览器下载目录。",
    exportData,
  );
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

        confirmDialog(
          "导入数据",
          "检测到 <b>" +
            incoming.chapters.length +
            "</b> 个章节。<br>" +
            "将采用「合并」方式导入：<br>" +
            "· 本地独有的章节和单词会保留<br>" +
            "· 新章节会追加<br>" +
            "· 同名章节按单词去重合并",
          function () {
            doImportMerge(incoming);
          },
        );
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
  try {
    const current = data.chapters || [];
    const byName = new Map();
    current.forEach((ch) => byName.set(ch.name, ch));

    let addedCh = 0,
      addedWord = 0,
      mergedWord = 0;

    incoming.chapters.forEach((ch) => {
      const name = (ch.name || "").trim();
      if (!name) return;
      if (!byName.has(name)) {
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
        const target = byName.get(name);
        if (!Array.isArray(target.words)) target.words = [];
        const wordSet = new Set(target.words.map((w) => (w.text || "").trim()));
        (ch.words || []).forEach((w) => {
          const t = (w.text || "").trim();
          if (!t || wordSet.has(t)) return;
          target.words.push(normalizeWord(w));
          wordSet.add(t);
          mergedWord++;
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

    toast(
      "导入完成：新增 " +
        addedCh +
        " 章 / " +
        addedWord +
        " 词，合并 " +
        mergedWord +
        " 词",
    );
  } catch (e) {
    console.error("导入失败：", e);
    toast("导入失败：" + (e && e.message ? e.message : e));
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
  confirmDialog(
    "数据同步",
    "将从 <b>data.json</b> 合并词库：<br>" +
      "· 本地独有的章节和单词会保留<br>" +
      "· 云端独有的章节会追加<br>" +
      "· 同名章节按单词去重合并<br><br>" +
      "确定继续？",
    doSyncFromCloud,
  );
}

async function doSyncFromCloud() {
  if (location.protocol === "file:") {
    toast("本地文件模式下不支持同步，请用 HTTP 服务器访问");
    return;
  }

  try {
    const res = await fetch("data.json?_=" + Date.now(), { cache: "no-store" });
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
      dictLang:
        typeof cch.dictLang === "number"
          ? cch.dictLang
          : localCh
            ? localCh.dictLang
            : 0,
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
