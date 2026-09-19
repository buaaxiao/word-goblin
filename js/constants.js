/* ===================================================================
 * js/constants.js — 全局常量
 *   所有设置键、枚举、固定配置集中在此
 *   必须最先加载（在 core.js 之前）
 * =================================================================== */
"use strict";

/* =================================================================
 * 报词方式枚举（统一 0/1 语义）
 *   EN = 0：报英文单词（text）
 *   ZH = 1：报中文释义（meaning）
 *
 *   内存 / data.dictLang / 比较：用「数字」0 / 1
 *   DOM / localStorage：字符串，读时 Number()、写时 String()
 * ================================================================= */
const DICT_LANG = Object.freeze({
  EN: 0,
  ZH: 1,
});

/* =================================================================
 * 数据源（共享词库）
 * ================================================================= */
const DATA_DIR = "data";
const DATA_FILE = "data.json";
const DATA_URL = DATA_DIR + "/" + DATA_FILE;

/* =================================================================
 * 设置键（wordDictation.<scope>.<attr>.v1）
 *
 *   所有"需要持久化"的键集中在一个冻结对象里。
 *   - 代码里按名称引用：KEYS.THEME / KEYS.DICT_LANG / ...
 *   - 需要遍历时用：    SETTINGS_KEYS（由 KEYS 自动生成）
 *   - 单独定义时的短名：KEY_THEME = KEYS.THEME（方便书写）
 *
 *   加新键：只在 KEYS 里加一行 + （可选）加一行短名
 * ================================================================= */
const KEYS = Object.freeze({
  THEME: "wordDictation.theme.v1",
  DICT_LANG: "wordDictation.dictLang.v1",
  DICTATION: "wordDictation.dictation.v1",
  CHAPTER_COLLAPSED: "wordDictation.chapter.collapsed.v1",
  WORD_COLLAPSED: "wordDictation.word.collapsed.v1",
  CHAPTER_MODE: "wordDictation.chapter.mode.v1",
  WORD_MODE: "wordDictation.word.mode.v1",
});

/* =================================================================
 * 需持久化到 IndexedDB 的设置键清单（导出 / 导入 / 迁移共用）
 *   由 KEYS 自动生成，不用手动维护
 * ================================================================= */
const SETTINGS_KEYS = Object.values(KEYS);

/* =================================================================
 * 短名常量（便于书写，可读性更好）
 *   与 KEYS.XXX 等价；改动 KEYS 即可，不用同步改
 * ================================================================= */
const KEY_THEME = KEYS.THEME;
const KEY_DICT_LANG = KEYS.DICT_LANG;
const KEY_DICTATION = KEYS.DICTATION;
const KEY_CHAPTER_COLLAPSED = KEYS.CHAPTER_COLLAPSED;
const KEY_WORD_COLLAPSED = KEYS.WORD_COLLAPSED;
const KEY_CHAPTER_MODE = KEYS.CHAPTER_MODE;
const KEY_WORD_MODE = KEYS.WORD_MODE;

/* =================================================================
 * 旧键（一次性迁移用，不属于 KEYS 清单）
 * ================================================================= */
const KEY_DICT_LANG_OLD = "wordDictation.langSel.v1";
const KEY_COLLAPSE_OLD = "wordDictation.collapse.v4";
const KEY_COLLAPSE_MIGRATED = "wordDictation.collapseMigrated.v1";
const KEY_LIST_MODE_OLD = "wordDictation.listMode.v1";
const KEY_LIST_MODE_MIGRATED = "wordDictation.listModeMigrated.v1";

/* =================================================================
 * 默写设置默认值
 * ================================================================= */
const DICTATION_SETTINGS_DEFAULT = {
  intervalSec: 3,
  repeatCount: 3,
  repeatIntervalSec: 2,
  mode: 0,
  playOrder: 0,
};
