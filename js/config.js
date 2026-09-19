/* ===================================================================
 * js/config.js — 配置类（单一内存数据源）
 *   数据流：
 *     IndexedDB / localStorage
 *        ↕ (loadConfigFromStorage / persistConfigKey)
 *     config（内存，普通对象）
 *        ↕ (读 config.xxx / 写 config.xxx + persistConfigKey)
 *     所有业务模块
 *
 *   外部只读 config.xxx；改动必须走 setConfig / setConfigDictation
 *   （它们负责同步持久化）
 *
 *   依赖：constants.js（KEYS / DICT_LANG / DICTATION_SETTINGS_DEFAULT）
 *         db.js（dbGetAllSettings / dbPutSetting）
 * =================================================================== */
"use strict";

/* =================================================================
 * 配置对象（普通对象）
 * ================================================================= */
const config = {
  theme: "light",
  dictLang: DICT_LANG.ZH,
  chapterCollapsed: false,
  wordCollapsed: true,
  chapterMode: "edit",
  wordMode: "edit",
  dictation: {
    intervalSec: 3,
    repeatCount: 3,
    repeatIntervalSec: 2,
    mode: 0,
    playOrder: 0,
  },
};

/* =================================================================
 * 启动时：从 IndexedDB / localStorage 加载到 config
 * ================================================================= */
async function loadConfigFromStorage() {
  const loadedKeys = new Set();

  // 1. 优先从 IndexedDB 读
  try {
    if (typeof dbGetAllSettings === "function") {
      const rows = await dbGetAllSettings();
      for (const row of rows) {
        applyStoredSetting(row.key, row.value);
        loadedKeys.add(row.key);
      }
    }
  } catch (e) {
    console.warn("[config] 从 IndexedDB 读失败：", e);
  }

  // 2. 兜底：IndexedDB 没有的键，从 localStorage 补
  for (const key of SETTINGS_KEYS) {
    if (loadedKeys.has(key)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) applyStoredSetting(key, raw);
    } catch (e) {}
  }
}

/** 把"单个存储键值"应用到 config */
function applyStoredSetting(key, value) {
  switch (key) {
    case KEY_THEME:
      config.theme = value === "dark" ? "dark" : "light";
      break;
    case KEY_DICT_LANG:
      config.dictLang = normalizeDictLang(value);
      break;
    case KEY_CHAPTER_COLLAPSED:
      config.chapterCollapsed = value === "1";
      break;
    case KEY_WORD_COLLAPSED:
      config.wordCollapsed = value === "1";
      break;
    case KEY_CHAPTER_MODE:
      config.chapterMode = value === "view" ? "view" : "edit";
      break;
    case KEY_WORD_MODE:
      config.wordMode = value === "view" ? "view" : "edit";
      break;
    case KEY_DICTATION:
      try {
        const obj = JSON.parse(value);
        Object.assign(config.dictation, obj);
      } catch (e) {}
      break;
  }
}

/* =================================================================
 * 写配置（唯一入口，自动持久化）
 * ================================================================= */
function setConfig(key, value) {
  applyConfigValue(key, value);
  persistConfigKey(key);
}

/** 只改 config 不持久化——仅供 applyStoredSetting 内部用 */
function applyConfigValue(key, value) {
  switch (key) {
    case KEY_THEME:
      config.theme = value === "dark" ? "dark" : "light";
      break;
    case KEY_DICT_LANG:
      config.dictLang = normalizeDictLang(value);
      break;
    case KEY_CHAPTER_COLLAPSED:
      config.chapterCollapsed = !!value;
      break;
    case KEY_WORD_COLLAPSED:
      config.wordCollapsed = !!value;
      break;
    case KEY_CHAPTER_MODE:
      config.chapterMode = value === "view" ? "view" : "edit";
      break;
    case KEY_WORD_MODE:
      config.wordMode = value === "view" ? "view" : "edit";
      break;
    case KEY_DICTATION:
      Object.assign(config.dictation, value);
      break;
  }
}

/* =================================================================
 * 持久化单个 config 键 → IndexedDB + localStorage
 * ================================================================= */
function persistConfigKey(key) {
  let stored = null;
  switch (key) {
    case KEY_THEME:
      stored = config.theme;
      break;
    case KEY_DICT_LANG:
      stored = String(config.dictLang);
      break;
    case KEY_CHAPTER_COLLAPSED:
      stored = config.chapterCollapsed ? "1" : "0";
      break;
    case KEY_WORD_COLLAPSED:
      stored = config.wordCollapsed ? "1" : "0";
      break;
    case KEY_CHAPTER_MODE:
      stored = config.chapterMode;
      break;
    case KEY_WORD_MODE:
      stored = config.wordMode;
      break;
    case KEY_DICTATION:
      stored = JSON.stringify(config.dictation);
      break;
    default:
      return;
  }

  // 异步写 IndexedDB
  if (typeof dbPutSetting === "function") {
    dbPutSetting(key, stored).catch((e) =>
      console.warn("[config] 写 IndexedDB 失败：", e),
    );
  }
  // 同步写 localStorage（兜底）
  try {
    localStorage.setItem(key, stored);
  } catch (e) {}
}
