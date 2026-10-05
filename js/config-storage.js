/* ===================================================================
 * js/config-storage.js — 配置内存状态 + 持久化
 *
 *   本文件分三部分：
 *
 *   【A. 内存状态】
 *     · config              内存配置对象
 *     · SETTING_ACCESSORS   设置键 → config 属性 + 序列化规则
 *
 *   【B. 纯内存读写（不触碰存储）】
 *     · applyStoredSetting    存储字符串 → config（含归一化）
 *     · applyConfigValue      运行时值   → config（含归一化）
 *
 *   【C. 持久化 I/O】
 *     · loadConfigFromStorage 启动加载：IndexedDB → localStorage 兜底
 *     · setConfig             改 config + 持久化（业务唯一写入口）
 *     · persistConfigKey      持久化单个 config 键
 *
 *   依赖：
 *     config-base.js（间接）  SETTINGS_DEFAULTS / SETTINGS_KEYS / KEY_<NAME>
 *     config.js              枚举派生量 THEME_DEFAULT / DICT_LANG_DEFAULT /
 *                            DICT_MODE_DEFAULT / PLAY_ORDER_DEFAULT /
 *                            SYNC_MODE_DEFAULT / <ENUM>_LABELS 等
 *     logger.js              LOG_LEVEL_DEFAULT / LOG_LEVEL_LABELS
 *                            LOG_MAX_LINES_MIN / MAX / DEFAULT
 *     db.js（必需）          dbGetAllSettings / dbPutSetting
 *     logger.js（必需）      Log
 *
 *   加载顺序：
 *     config-base.js → config.js → db.js / logger.js → config-storage.js
 *
 *   注意：写路径同时写 IndexedDB 与 localStorage（双写兜底），
 *         读路径 IDB 优先、localStorage 兜底；两边可能短期不一致。
 * =================================================================== */
"use strict";

/* =================================================================
 * A. 内存状态
 * ================================================================= */

/* ---- config 内存对象 ----
 * 初始值来源：
 *   · 枚举型设置项  → <NAME>_DEFAULT（由 buildConstants 挂载）
 *   · 普通设置项    → SETTINGS_DEFAULTS.<attr>
 *   （LOG_LEVEL 为 logger.js 独立维护的普通设置项，默认值 = LOG_LEVEL_DEFAULT）
 */
const config = {
  /* 枚举型（默认项） */
  theme: THEME_DEFAULT,
  dictLang: DICT_LANG_DEFAULT,
  dictMode: DICT_MODE_DEFAULT,
  playOrder: PLAY_ORDER_DEFAULT,
  syncMode: SYNC_MODE_DEFAULT,

  /* 普通标量型 */
  chapterCollapsed: SETTINGS_DEFAULTS.chapterCollapsed,
  wordCollapsed: SETTINGS_DEFAULTS.wordCollapsed,
  chapterMode: SETTINGS_DEFAULTS.chapterMode,
  wordMode: SETTINGS_DEFAULTS.wordMode,
  logLevel: LOG_LEVEL_DEFAULT,
  logMaxLines: SETTINGS_DEFAULTS.logMaxLines,

  /* 默写 5 项子设置（独立设置项） */
  dictationIntervalSec: SETTINGS_DEFAULTS.dictationIntervalSec,
  dictationRepeatCount: SETTINGS_DEFAULTS.dictationRepeatCount,
  dictationRepeatIntervalSec: SETTINGS_DEFAULTS.dictationRepeatIntervalSec,
  dictationMode: SETTINGS_DEFAULTS.dictationMode,
  dictationPlayOrder: SETTINGS_DEFAULTS.dictationPlayOrder,
};

/* ---- 归一化（由 logger.js 提供全局 normalizeLogLevel / normalizeLogMaxLines） ---- */

/* ---- 设置键 → config 属性 + 序列化规则 ----
 *   键：KEY_<NAME>（由 config-base.js 的 buildConstants 挂载）
 *   attr     : config 上的属性名
 *   toStore  : config 值 → 存储字符串
 *   fromStore: 存储字符串 → config 值（含归一化）
 */
const SETTING_ACCESSORS = {
  [KEY_THEME]: {
    attr: "theme",
    toStore: (v) => v,
    fromStore: (v) => (THEME_LABELS[v] ? v : THEME_DEFAULT),
  },
  [KEY_DICT_LANG]: {
    attr: "dictLang",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && DICT_LANG_LABELS[n] ? n : DICT_LANG_DEFAULT;
    },
  },
  [KEY_DICT_MODE]: {
    attr: "dictMode",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && DICT_MODE_LABELS[n] ? n : DICT_MODE_DEFAULT;
    },
  },
  [KEY_PLAY_ORDER]: {
    attr: "playOrder",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && PLAY_ORDER_LABELS[n]
        ? n
        : PLAY_ORDER_DEFAULT;
    },
  },
  [KEY_SYNC_MODE]: {
    attr: "syncMode",
    toStore: (v) => v,
    fromStore: (v) => (SYNC_MODE_LABELS[v] ? v : SYNC_MODE_DEFAULT),
  },
  [KEY_DICTATION_INTERVAL_SEC]: {
    attr: "dictationIntervalSec",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 120
        ? n
        : SETTINGS_DEFAULTS.dictationIntervalSec;
    },
  },
  [KEY_DICTATION_REPEAT_COUNT]: {
    attr: "dictationRepeatCount",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 && n <= 10
        ? n
        : SETTINGS_DEFAULTS.dictationRepeatCount;
    },
  },
  [KEY_DICTATION_REPEAT_INTERVAL_SEC]: {
    attr: "dictationRepeatIntervalSec",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 60
        ? n
        : SETTINGS_DEFAULTS.dictationRepeatIntervalSec;
    },
  },
  [KEY_DICTATION_MODE]: {
    attr: "dictationMode",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && DICT_MODE_LABELS[n]
        ? n
        : SETTINGS_DEFAULTS.dictationMode;
    },
  },
  [KEY_DICTATION_PLAY_ORDER]: {
    attr: "dictationPlayOrder",
    toStore: (v) => String(v),
    fromStore: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && PLAY_ORDER_LABELS[n]
        ? n
        : SETTINGS_DEFAULTS.dictationPlayOrder;
    },
  },
  [KEY_CHAPTER_COLLAPSED]: {
    attr: "chapterCollapsed",
    toStore: (v) => (v ? "1" : "0"),
    fromStore: (v) => v === "1",
  },
  [KEY_WORD_COLLAPSED]: {
    attr: "wordCollapsed",
    toStore: (v) => (v ? "1" : "0"),
    fromStore: (v) => v === "1",
  },
  [KEY_CHAPTER_MODE]: {
    attr: "chapterMode",
    toStore: (v) => v,
    fromStore: (v) => (v === "view" ? "view" : "edit"),
  },
  [KEY_WORD_MODE]: {
    attr: "wordMode",
    toStore: (v) => v,
    fromStore: (v) => (v === "view" ? "view" : "edit"),
  },
  [KEY_LOG_LEVEL]: {
    attr: "logLevel",
    toStore: (v) => normalizeLogLevel(v),
    fromStore: (v) => normalizeLogLevel(v),
  },
  [KEY_LOG_MAX_LINES]: {
    attr: "logMaxLines",
    toStore: (v) => String(normalizeLogMaxLines(v)),
    fromStore: (v) => normalizeLogMaxLines(v),
  },
};

/* =================================================================
 * B. 纯内存读写（不触碰存储）
 *
 *   仅供本文件 C 段调用；业务代码请走 setConfig()。
 * ================================================================= */

/** 把存储字符串写入 config（含归一化），不持久化 */
function applyStoredSetting(key, value) {
  const acc = SETTING_ACCESSORS[key];
  if (!acc) return;
  config[acc.attr] = acc.fromStore(value);
}

/** 把运行时值写入 config（含归一化），不持久化 */
function applyConfigValue(key, value) {
  const acc = SETTING_ACCESSORS[key];
  if (!acc) return;
  // 值先经 toStore 归一化，再经 fromStore 写回，保证一致性
  config[acc.attr] = acc.fromStore(acc.toStore(value));
}

/* =================================================================
 * C. 持久化 I/O
 * ================================================================= */

/** 启动加载：IndexedDB → localStorage 兜底，把已存设置应用到 config */
async function loadConfigFromStorage() {
  const loadedKeys = new Set();

  /* 1. 优先 IndexedDB */
  try {
    const rows = await dbGetAllSettings();
    for (const row of rows) {
      applyStoredSetting(row.key, row.value);
      loadedKeys.add(row.key);
    }
  } catch (e) {
    Log.warn("config", "从 IndexedDB 读失败：", e);
  }

  /* 2. localStorage 兜底 */
  let fallbackCount = 0;
  for (const key of SETTINGS_KEYS) {
    if (loadedKeys.has(key)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        applyStoredSetting(key, raw);
        fallbackCount++;
      }
    } catch {}
  }

  Log.info(
    "config",
    `设置加载完成：IDB ${loadedKeys.size} 项 · localStorage 兜底 ${fallbackCount} 项 · ` +
      `主题 ${config.theme} · 报词方式 ${config.dictLang} · 同步策略 ${config.syncMode}`,
  );
}

/** 改 config 并持久化（业务代码唯一写入口） */
function setConfig(key, value) {
  applyConfigValue(key, value);
  persistConfigKey(key);
}

/** 持久化单个 config 键 → IndexedDB + localStorage */
function persistConfigKey(key) {
  const acc = SETTING_ACCESSORS[key];
  if (!acc) return;

  const stored = acc.toStore(config[acc.attr]);

  Log.debug("config", "持久化设置 " + key + " = " + stored);

  /* 异步写 IndexedDB */
  dbPutSetting(key, stored).catch((e) => {
    Log.warn("config", "写 IndexedDB 失败：", e);
  });

  /* 同步写 localStorage（兜底） */
  try {
    localStorage.setItem(key, stored);
  } catch (e) {
    Log.warn("config", "写 localStorage 失败（可能已超配额）：", e);
  }
}
