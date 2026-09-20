/* ===================================================================
 * js/core.js - 基础工具 / 主题 / 折叠 / 搜索
 *
 * 依赖：
 *   - constants.js ：DICT_LANG / 各设置键
 *   - config.js    ：config 对象 / setConfig / persistConfigKey
 * =================================================================== */
"use strict";

/* =================================================================
 * 报词方式工具
 * ================================================================= */
function dictLangIsChinese(v) {
  return Number(v) === DICT_LANG.ZH;
}

function normalizeDictLang(v) {
  if (v === true) return DICT_LANG.ZH;
  if (v === false) return DICT_LANG.EN;
  const n = Number(v);
  return n === DICT_LANG.ZH ? DICT_LANG.ZH : DICT_LANG.EN;
}

function dictLangLabel(v) {
  return DICT_LANG_LABELS[normalizeDictLang(v)] || DICT_LANG_DEFAULT;
}

/* =================================================================
 * 数据源 URL
 * ================================================================= */
function getDataUrl() {
  return DATA_URL + "?_=" + Date.now();
}

let openWordDetails = new Set();

/* =================================================================
 * 主题（config.theme）
 * ================================================================= */
function loadTheme() {
  const v = config.theme === "dark" ? "dark" : "light";
  if (v === "dark") {
    document.body.classList.add("dark");
    updateThemeUI("dark");
  } else {
    updateThemeUI("light");
  }
  syncThemeModeRadios(v);
}

function getCurrentThemeMode() {
  return config.theme === "dark" ? "dark" : "light";
}

function updateThemeUI(theme) {
  const icon = document.getElementById("themeIcon");
  const text = document.getElementById("themeText");
  if (theme === "dark") {
    if (icon) icon.textContent = "🌙";
    if (text) text.textContent = "深色";
  } else {
    if (icon) icon.textContent = "☀️";
    if (text) text.textContent = "浅色";
  }
}

function setThemeMode(mode) {
  const isDark = mode === "dark";
  document.body.classList.toggle("dark", isDark);
  setConfig(KEY_THEME, isDark ? "dark" : "light");
  updateThemeUI(isDark ? "dark" : "light");
  const meta = document.getElementById("themeColorMeta");
  if (meta) meta.setAttribute("content", isDark ? "#1f2937" : "#4a7cff");
  syncThemeModeRadios(isDark ? "dark" : "light");
}

function syncThemeModeRadios(mode) {
  document.querySelectorAll("input[name=themeMode]").forEach((r) => {
    r.checked = r.value === mode;
  });
}

/* =================================================================
 * 报词方式（config.dictLang）
 * ================================================================= */
function getDefaultDictLang() {
  return config.dictLang;
}

function loadLangSelSetting() {
  const v = normalizeDictLang(config.dictLang);

  const el = $("langSel"); // 老 UI 兜底
  if (el) el.value = String(v);

  if ($("dictLangSelect") && typeof setCustomSelectValue === "function") {
    setCustomSelectValue("dictLangSelect", String(v));
  }
}

/* =================================================================
 * 折叠状态（config.chapterCollapsed / config.wordCollapsed）
 * ================================================================= */
function loadCollapseState() {
  // config 已在 loadConfigFromStorage 里初始化，这里只做旧键一次性迁移
  try {
    if (localStorage.getItem(KEY_COLLAPSE_MIGRATED) !== "1") {
      const old = localStorage.getItem(KEY_COLLAPSE_OLD);
      if (old) {
        const obj = JSON.parse(old);
        if (typeof obj.chapter === "boolean") {
          setConfig(KEY_CHAPTER_COLLAPSED, obj.chapter);
        }
        if (typeof obj.word === "boolean") {
          setConfig(KEY_WORD_COLLAPSED, obj.word);
        }
      }
      localStorage.setItem(KEY_COLLAPSE_MIGRATED, "1");
    }
  } catch (e) {}
}

function saveCollapseState() {
  persistConfigKey(KEY_CHAPTER_COLLAPSED);
  persistConfigKey(KEY_WORD_COLLAPSED);
}

function applyCollapseState(isFirstLoad = false) {
  if (isFirstLoad) {
    const visibleWordCount = getSelectedWordCount();
    if (visibleWordCount === 0) {
      setConfig(KEY_WORD_COLLAPSED, true);
    }
    if (data.chapters.length === 0) {
      setConfig(KEY_CHAPTER_COLLAPSED, true);
    }
  }

  applyOneCollapse(
    "chapterHeader",
    "chapterBody",
    "chapterArrow",
    "📂",
    "📁",
    config.chapterCollapsed,
  );
  applyOneCollapse(
    "wordHeader",
    "wordBody",
    "wordArrow",
    "📖",
    "📕",
    config.wordCollapsed,
  );
}

function getSelectedWordCount() {
  let n = 0;
  for (let i = 0; i < data.chapters.length; i++) {
    const ch = data.chapters[i];
    if (ch.selected) n += (ch.words || []).length;
  }
  return n;
}

function applyOneCollapse(
  headerId,
  bodyId,
  arrowId,
  iconOpen,
  iconClosed,
  collapsed,
) {
  const header = $(headerId);
  const body = $(bodyId);
  const arrow = $(arrowId);
  if (!header || !body) return;
  if (collapsed) {
    header.classList.add("collapsed");
    body.classList.add("collapsed");
    if (arrow) arrow.textContent = iconClosed;
  } else {
    header.classList.remove("collapsed");
    body.classList.remove("collapsed");
    if (arrow) arrow.textContent = iconOpen;
  }
}

function toggleSection(which) {
  if (which === "chapter") {
    setConfig(KEY_CHAPTER_COLLAPSED, !config.chapterCollapsed);
  } else if (which === "word") {
    setConfig(KEY_WORD_COLLAPSED, !config.wordCollapsed);
  }
  applyCollapseState();
}

/* =================================================================
 * 列表显示模式（config.chapterMode / config.wordMode）
 * ================================================================= */
function loadListMode() {
  // config 已在 loadConfigFromStorage 里初始化，这里只做旧键一次性迁移
  try {
    if (localStorage.getItem(KEY_LIST_MODE_MIGRATED) !== "1") {
      const old = localStorage.getItem(KEY_LIST_MODE_OLD);
      if (old) {
        let v;
        try {
          v = JSON.parse(old);
        } catch (e) {
          v = old;
        }
        if (typeof v === "string") {
          const m = v === "view" ? "view" : "edit";
          setConfig(KEY_CHAPTER_MODE, m);
          setConfig(KEY_WORD_MODE, m);
        } else if (v && typeof v === "object") {
          setConfig(KEY_CHAPTER_MODE, v.chapter === "view" ? "view" : "edit");
          setConfig(KEY_WORD_MODE, v.word === "view" ? "view" : "edit");
        }
      }
      localStorage.setItem(KEY_LIST_MODE_MIGRATED, "1");
    }
  } catch (e) {}
}

function saveListMode() {
  persistConfigKey(KEY_CHAPTER_MODE);
  persistConfigKey(KEY_WORD_MODE);
}

function applyModesUI() {
  const cb = $("modeBtnChapter"),
    wb = $("modeBtnWord");
  if (cb)
    cb.textContent = config.chapterMode === "view" ? "✏️ 编辑" : "👁 查看";
  if (wb) wb.textContent = config.wordMode === "view" ? "✏️ 编辑" : "👁 查看";
  const chBody = $("chapterBody");
  if (chBody)
    chBody.classList.toggle("list-view", config.chapterMode === "view");
  const wBody = $("wordBody");
  if (wBody) wBody.classList.toggle("list-view", config.wordMode === "view");
}

function toggleChapterMode() {
  setConfig(KEY_CHAPTER_MODE, config.chapterMode === "edit" ? "view" : "edit");
  setConfig(KEY_CHAPTER_COLLAPSED, false);
  applyModesUI();
  applyCollapseState();
  renderChapterList();
}

function toggleWordMode() {
  setConfig(KEY_WORD_MODE, config.wordMode === "edit" ? "view" : "edit");
  setConfig(KEY_WORD_COLLAPSED, false);
  applyModesUI();
  applyCollapseState();
  renderWords();
}

/* =================================================================
 * 搜索
 * ================================================================= */
let chapterSearchQuery = "";
let wordSearchQuery = "";

function onChapterSearch() {
  const inp = $("chapterSearch");
  chapterSearchQuery = inp.value.trim();
  const wrap = $("chapterSearchWrap");
  if (wrap) wrap.classList.toggle("has-text", chapterSearchQuery.length > 0);
  renderChapterList();
}
function clearChapterSearch(e) {
  if (e) e.stopPropagation();
  const inp = $("chapterSearch");
  if (inp) inp.value = "";
  chapterSearchQuery = "";
  const wrap = $("chapterSearchWrap");
  if (wrap) wrap.classList.remove("has-text");
  renderChapterList();
}
function onWordSearch() {
  const inp = $("wordSearch");
  wordSearchQuery = inp.value.trim();
  const wrap = $("wordSearchWrap");
  if (wrap) wrap.classList.toggle("has-text", wordSearchQuery.length > 0);
  renderWords();
}
function clearWordSearch(e) {
  if (e) e.stopPropagation();
  const inp = $("wordSearch");
  if (inp) inp.value = "";
  wordSearchQuery = "";
  const wrap = $("wordSearchWrap");
  if (wrap) wrap.classList.remove("has-text");
  renderWords();
}

/* =================================================================
 * 工具函数
 * ================================================================= */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function highlightText(text, query) {
  if (!query) return esc(text);
  const safe = esc(text);
  const q = esc(query);
  try {
    const re = new RegExp("(" + escapeRegex(q) + ")", "gi");
    return safe.replace(re, '<mark class="hl">$1</mark>');
  } catch (e) {
    return safe;
  }
}
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function nowStr() {
  const d = new Date();
  return todayStr() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function avg(w) {
  return w.scoreCount > 0 ? (w.scoreSum / w.scoreCount).toFixed(1) : "0.0";
}
function formatDur(s) {
  const m = Math.floor(s / 60),
    ss = s % 60;
  return m > 0 ? m + "分" + ss + "秒" : ss + "秒";
}

function $(id) {
  return document.getElementById(id);
}
function toast(msg) {
  let t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* =================================================================
 * 居中告警
 * ================================================================= */
function showAlert(msg, opts) {
  opts = opts || {};
  const okTitle = opts.okTitle || "确定";
  const cancelTitle = opts.cancelTitle || "关闭";
  const onOk = opts.onOk;
  const onCancel = opts.onCancel;

  let alertEl = $("alertOverlay");
  if (!alertEl) {
    alertEl = document.createElement("div");
    alertEl.id = "alertOverlay";
    alertEl.className = "modal";
    alertEl.innerHTML =
      '<div class="modal-box center-alert">' +
      '<div class="modal-head">' +
      '<div style="flex:1;"></div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button type="button" class="modal-save" title="' +
      okTitle +
      '">√</button>' +
      '<button type="button" class="modal-close" title="' +
      cancelTitle +
      '">✕</button>' +
      "</div>" +
      "</div>" +
      '<div class="alert-icon">⚠️</div>' +
      '<p id="alertMsg" class="alert-msg"></p>' +
      "</div>";

    alertEl.addEventListener("click", function (e) {
      if (e.target === alertEl) closeAlert();
    });
    document.body.appendChild(alertEl);
  }

  const box = alertEl.querySelector(".modal-box");
  const saveBtn = box.querySelector(".modal-save");
  const closeBtn = box.querySelector(".modal-close");

  saveBtn.onclick = function () {
    closeAlert();
    if (typeof onOk === "function") onOk();
  };
  closeBtn.onclick = function () {
    closeAlert();
    if (typeof onCancel === "function") onCancel();
  };

  $("alertMsg").textContent = msg;
  alertEl.classList.remove("hidden");
}

function closeAlert() {
  const alertEl = $("alertOverlay");
  if (alertEl) alertEl.classList.add("hidden");
}

/* =================================================================
 * 默写设置（config.dictation）
 * ================================================================= */
function getDictationSettings() {
  return Object.assign({}, config.dictation);
}

function saveDictationSettings() {
  const obj = {
    intervalSec:
      parseInt($("intervalSec") && $("intervalSec").value, 10) ||
      DICTATION_SETTINGS_DEFAULT.intervalSec,
    repeatCount:
      parseInt($("repeatCount") && $("repeatCount").value, 10) ||
      DICTATION_SETTINGS_DEFAULT.repeatCount,
    repeatIntervalSec:
      parseInt($("repeatIntervalSec") && $("repeatIntervalSec").value, 10) ||
      DICTATION_SETTINGS_DEFAULT.repeatIntervalSec,
    mode: config.dictation.mode || DICT_MODE.ALL,
    playOrder: config.dictation.playOrder || PLAY_ORDER.SEQ,
  };
  setConfig(KEY_DICTATION, obj);
}

function loadDictationSettings() {
  const s = config.dictation;
  if ($("intervalSec")) $("intervalSec").value = s.intervalSec;
  if ($("repeatCount")) $("repeatCount").value = s.repeatCount;
  if ($("repeatIntervalSec"))
    $("repeatIntervalSec").value = s.repeatIntervalSec;
  if (typeof setCustomSelectValue === "function") {
    if ($("playOrderSelect"))
      setCustomSelectValue(
        "playOrderSelect",
        String(s.playOrder || PLAY_ORDER.SEQ),
      );
    if ($("dictModeSelect"))
      setCustomSelectValue("dictModeSelect", String(s.mode || DICT_MODE.ALL));
  }
}

function getSyncMode() {
  return config.syncMode || "merge";
}
