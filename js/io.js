/* ===================================================================
 * js/io.js — 数据导入 / 导出 / 同步
 *
 * 依赖：
 *   - core.js       : $, toast
 *   - storage.js    : data, saveData, loadDeletedUids
 *   - chapters.js   : renderChapterList, initListVisibleSet
 *   - words.js      : renderWords
 *   - reports.js    : updateStats
 *   - main.js       : openModal, closeModal
 * =================================================================== */

// ===================================================================
// 一、导出
// ===================================================================
function confirmExport() {
  openConfirmModal({
    title: "导出数据",
    body: "确定导出当前数据吗？",
    okTitle: "导出",
    onOk: exportData,
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
// 二、导入
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
            const local = wordMap.get(t);
            let filled = false;
            if (!local.meaning && w.meaning) {
              local.meaning = (w.meaning || "").trim();
              filled = true;
            }
            chSkipped++;
            if (filled) chFilled++;
            return;
          }

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

    openModal(
      "导入结果",
      detailHtml +
        '<div class="row" style="justify-content:center;margin-top:16px;">' +
        '<button class="primary" onclick="closeModal()">知道了</button>' +
        "</div>",
    );

    return false;
  } catch (e) {
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
// 三、数据同步（仅点击按钮 + 确认后触发）
// ===================================================================
function syncFromCloud() {
  const initialMode =
    typeof getSyncMode === "function" ? getSyncMode() : "merge";

  const descByMode = {
    merge:
      "· 本地独有的章节和单词会保留<br>" +
      "· 云端独有的章节会追加<br>" +
      "· 同名章节按单词去重合并<br>" +
      "· 用户删除过的章节不会复活",
    cloud_first:
      "· <b>云端为权威</b>，用云端覆盖本地同名章节<br>" +
      "· 本地独有章节保留<br>" +
      "· 学习记录（对/错/均分）保留",
    cloud_replace:
      "· <b>云端完全替换本地</b><br>" +
      "· 本地独有的章节和单词会被<b style='color:var(--danger);'>删除</b><br>" +
      "· 学习记录保留（按单词 text 匹配）<br>" +
      '<b style="color:var(--danger);">⚠️ 此操作不可撤销</b>',
    pull_only: "· 只拉取云端有、本地没有的章节<br>" + "· 本地已有章节一律不动",
  };

  const body =
    '<div style="color:var(--text-soft);font-size:14px;line-height:1.7;">' +
    "选择同步方式：<br>" +
    '<div id="syncModeOptions" style="margin:8px 0 4px;"></div>' +
    '<div id="syncModeDesc" style="margin-top:8px;color:var(--text-soft);font-size:13px;line-height:1.7;">' +
    (descByMode[initialMode] || "") +
    "</div>" +
    "</div>" +
    '<div style="margin-top:10px;padding:8px 12px;background:var(--primary-light);' +
    'border-radius:8px;color:var(--primary);font-size:13px;font-weight:600;">' +
    "📡 此操作需要网络连接" +
    "</div>";

  openConfirmModal({
    title: "☁️ 云端同步",
    body: body,
    danger: initialMode === "cloud_replace",
    okTitle: "同步",
    onOk: doSyncFromCloud,
    onOpened: function () {
      // ★ 弹窗打开后渲染 custom-select
      const box = document.getElementById("syncModeOptions");
      if (!box || typeof _buildCustomSelect !== "function") return;

      const cur = initialMode;
      box.innerHTML = _buildCustomSelect(
        "syncModeSelect",
        cur,
        SYNC_MODE_LABELS[cur] || "合并更新（默认）",
        SYNC_MODE_DEF,
        "pickSyncModeInConfirm",
      );
    },
  });
}

function pickSyncModeInConfirm(value) {
  setCustomSelectValue("syncModeSelect", value);
  _closeAllCustomSelects();

  const descByMode = {
    merge:
      "· 本地独有的章节和单词会保留<br>" +
      "· 云端独有的章节会追加<br>" +
      "· 同名章节按单词去重合并<br>" +
      "· 用户删除过的章节不会复活",
    cloud_first:
      "· <b>云端为权威</b>，用云端覆盖本地同名章节<br>" +
      "· 本地独有章节保留<br>" +
      "· 学习记录（对/错/均分）保留",
    cloud_replace:
      "· <b>云端完全替换本地</b><br>" +
      "· 本地独有的章节和单词会被<b style='color:var(--danger);'>删除</b><br>" +
      "· 学习记录保留（按单词 text 匹配）<br>" +
      '<b style="color:var(--danger);">⚠️ 此操作不可撤销</b>',
    pull_only: "· 只拉取云端有、本地没有的章节<br>" + "· 本地已有章节一律不动",
  };

  const descEl = document.getElementById("syncModeDesc");
  if (descEl) descEl.innerHTML = descByMode[value] || "";

  // 危险色：cloud_replace 时 √ 按钮变红
  const modalBody = document.getElementById("modalBody");
  const saveBtn = modalBody && modalBody.querySelector(".modal-save");
  if (saveBtn) {
    saveBtn.classList.toggle("modal-save-danger", value === "cloud_replace");
  }

  // 立即写入 config（关弹窗再同步也用最新的）
  setConfig(KEY_SYNC_MODE, value);
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

// 把共享词库合并进 wordGoblinLocal
//   ★ 按 config.syncMode 走不同策略
async function mergeCloudIntoLocal(cloud) {
  const mode = typeof getSyncMode === "function" ? getSyncMode() : "merge";
  const localChapters = await dbGetAllChapters();
  const localWords = await dbGetAllWords();
  const localChapterByName = new Map(localChapters.map((c) => [c.name, c]));

  const deletedUids = loadDeletedUids();
  let nextOrder =
    localChapters.reduce((max, c) => Math.max(max, c.order || 0), -1) + 1;

  // 云端所有章节 id（用于 cloud_replace 删除本地独有）
  const cloudChapterNames = new Set();

  // ========== 步骤 1：按策略处理每个云端章节 ==========
  for (const cch of cloud.chapters || []) {
    const cloudId = cch.id || "ch_shared_" + encodeURIComponent(cch.name);
    cloudChapterNames.add(cch.name);

    const localCh = localChapterByName.get(cch.name);

    // ---- 策略：仅新增 ----
    if (mode === "pull_only") {
      if (localCh) continue; // 已有 → 不动
      if (deletedUids.has(cloudId)) continue; // 黑名单 → 跳过
      await _insertCloudChapter(cch, cloudId, nextOrder++);
      continue;
    }

    // ---- 策略：云端覆盖（本地独有也删） ----
    if (mode === "cloud_replace") {
      const chapterId = localCh ? localCh.id : genId("ch_");
      await _overwriteChapterFromCloud(cch, chapterId, localCh, nextOrder++);
      continue;
    }

    // ---- 策略：云端优先 / 合并 ----
    if (!localCh) {
      // 本地没有
      if (deletedUids.has(cloudId)) continue; // 黑名单
      await _insertCloudChapter(cch, cloudId, nextOrder++);
    } else {
      // 本地已有 → 按策略
      if (mode === "cloud_first") {
        // 用云端覆盖本地章节属性 + 单词属性
        await _overwriteChapterFromCloud(
          cch,
          localCh.id,
          localCh,
          localCh.order,
        );
      } else {
        // merge：保留本地，补齐云端独有单词
        await _mergeChapterWords(cch, localCh);
      }
    }
  }

  // ========== 步骤 2：cloud_replace 删除本地独有章节 ==========
  if (mode === "cloud_replace") {
    for (const lc of localChapters) {
      if (!cloudChapterNames.has(lc.name)) {
        await dbDeleteChapter(lc.id);
        addDeletedUid(lc.id); // 记黑名单，防止下次又拉
        const ws = await dbGetWordsByChapter(lc.id);
        for (const w of ws) {
          await dbDeleteWord(w.id);
          addDeletedUid(w.id);
        }
      }
    }
  }
}

/* ---------- 内部辅助 ---------- */

// 插入一个云端章节（本地完全没有）
async function _insertCloudChapter(cch, cloudId, order) {
  await dbPutChapter({
    id: cloudId,
    name: cch.name,
    selected: false,
    dictLang: normalizeDictLang(
      typeof cch.dictLang === "number" ? cch.dictLang : DICT_LANG.EN,
    ),
    order,
  });
  for (const cw of cch.words || []) {
    await dbPutWord({
      id: cw.id || genId("w_"),
      chapterId: cloudId,
      text: cw.text,
      meaning: cw.meaning,
      wrongCount: 0,
      correctCount: 0,
      lastErrorDate: "",
      lastCorrectDate: "",
      scoreCount: 0,
      scoreSum: 0,
    });
  }
}

// 用云端完全覆盖某个本地章节（章节属性 + 单词）
async function _overwriteChapterFromCloud(cch, chapterId, localCh, order) {
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
    order: localCh ? localCh.order : order,
  });

  // 本地已有单词按 text 索引，用于复用 id + 统计
  const localWordsOfCh = localCh ? await dbGetWordsByChapter(localCh.id) : [];
  const localWordByText = new Map(localWordsOfCh.map((w) => [w.text, w]));
  const keptIds = new Set();

  for (const cw of cch.words || []) {
    const lw = localWordByText.get(cw.text);
    const wid = lw ? lw.id : cw.id || genId("w_");
    keptIds.add(wid);
    await dbPutWord({
      id: wid,
      chapterId,
      text: cw.text,
      meaning: cw.meaning || "",
      // 统计字段：本地有就保留，没有就清零
      wrongCount: lw ? lw.wrongCount : 0,
      correctCount: lw ? lw.correctCount : 0,
      lastErrorDate: lw ? lw.lastErrorDate : "",
      lastCorrectDate: lw ? lw.lastCorrectDate : "",
      scoreCount: lw ? lw.scoreCount : 0,
      scoreSum: lw ? lw.scoreSum : 0,
    });
  }

  // 本地独有单词 → 删除
  for (const lw of localWordsOfCh) {
    if (!keptIds.has(lw.id)) {
      await dbDeleteWord(lw.id);
      addDeletedUid(lw.id);
    }
  }
}

// 合并策略：保留本地，补齐云端独有单词
async function _mergeChapterWords(cch, localCh) {
  const localWordsOfCh = await dbGetWordsByChapter(localCh.id);
  const localWordByText = new Map(localWordsOfCh.map((w) => [w.text, w]));

  for (const cw of cch.words || []) {
    const lw = localWordByText.get(cw.text);
    if (lw) {
      // 只补空 meaning
      if (!lw.meaning && cw.meaning) {
        await dbPutWord({ ...lw, meaning: cw.meaning });
      }
      continue;
    }
    // 本地没有 → 补
    await dbPutWord({
      id: cw.id || genId("w_"),
      chapterId: localCh.id,
      text: cw.text,
      meaning: cw.meaning || "",
      wrongCount: 0,
      correctCount: 0,
      lastErrorDate: "",
      lastCorrectDate: "",
      scoreCount: 0,
      scoreSum: 0,
    });
  }
}
