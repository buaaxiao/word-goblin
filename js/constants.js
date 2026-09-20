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
/* =================================================================
 * 报词方式（唯一定义源）
 *   DICT_LANG：代码用（DICT_LANG.ZH）
 *   DICT_LANG_LABELS：UI 显示
 * ================================================================= */
const DICT_LANG = Object.freeze({
  EN: 0,
  ZH: 1,
});

const DICT_LANG_DEF = Object.freeze([
  { key: "ZH", value: DICT_LANG.ZH, label: "汉语" },
  { key: "EN", value: DICT_LANG.EN, label: "English" },
]);

const DICT_LANG_LABELS = Object.freeze(
  Object.fromEntries(DICT_LANG_DEF.map((d) => [d.value, d.label])),
);

/* =================================================================
 * 默写范围（唯一定义源）
 *   DICT_MODE：代码用
 *   DICT_MODE_LABELS：UI 显示
 * ================================================================= */
const DICT_MODE = Object.freeze({
  ALL: 0, // 全部单词
  WRONG: 1, // 仅错题
  LAST_WRONG: 2, // 仅最后错误
});

const DICT_MODE_DEF = Object.freeze([
  { key: "ALL", value: DICT_MODE.ALL, label: "全部单词" },
  { key: "WRONG", value: DICT_MODE.WRONG, label: "仅错题" },
  { key: "LAST_WRONG", value: DICT_MODE.LAST_WRONG, label: "仅最后错误" },
]);

const DICT_MODE_LABELS = Object.freeze(
  Object.fromEntries(DICT_MODE_DEF.map((d) => [d.value, d.label])),
);

/* =================================================================
 * 播报顺序（唯一定义源）
 *   代码用 PLAY_ORDER.SEQ / 持久化存数字 / UI 显示 PLAY_ORDER_LABELS
 * ================================================================= */
const PLAY_ORDER_DEF = Object.freeze([
  { key: "SEQ", value: 0, label: "顺序" },
  { key: "RANDOM", value: 1, label: "随机" },
  { key: "LOOP", value: 2, label: "循环" },
  { key: "SINGLE", value: 3, label: "单个" },
  { key: "SINGLE_LOOP", value: 4, label: "单个循环" },
]);

const PLAY_ORDER = Object.freeze(
  Object.fromEntries(PLAY_ORDER_DEF.map((d) => [d.key, d.value])),
);

const PLAY_ORDER_LABELS = Object.freeze(
  Object.fromEntries(PLAY_ORDER_DEF.map((d) => [d.value, d.label])),
);

/* =================================================================
 * 云端同步策略（唯一定义源）
 * ================================================================= */
const SYNC_MODE_DEF = Object.freeze([
  { key: "MERGE", value: "merge", label: "合并更新（默认）" },
  {
    key: "CLOUD_FIRST",
    value: "cloud_first",
    label: "云端优先（保留本地独有）",
  },
  {
    key: "CLOUD_REPLACE",
    value: "cloud_replace",
    label: "云端覆盖（删除本地独有）",
  },
  { key: "PULL_ONLY", value: "pull_only", label: "仅新增（不动已有）" },
]);

const SYNC_MODE = Object.freeze(
  Object.fromEntries(SYNC_MODE_DEF.map((d) => [d.key, d.value])),
);

const SYNC_MODE_LABELS = Object.freeze(
  Object.fromEntries(SYNC_MODE_DEF.map((d) => [d.value, d.label])),
);

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
 *   加新键：只在 KEYS 里加一行 + （可选）加一行短名 + 一行中文标签
 * ================================================================= */
const KEYS = Object.freeze({
  THEME: "wordDictation.theme.v1",
  DICT_LANG: "wordDictation.dictLang.v1",
  DICTATION: "wordDictation.dictation.v1",
  SYNC_MODE: "wordDictation.syncMode.v1",
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
const KEY_SYNC_MODE = KEYS.SYNC_MODE;

/* =================================================================
 * 设置键 → 中文标签（导入 / 导出结果提示用）
 *   与 KEYS 一一对应；改动 KEYS 时同步加一行
 * ================================================================= */
const SETTINGS_KEY_LABELS = Object.freeze({
  [KEY_THEME]: "主题颜色模式",
  [KEY_DICT_LANG]: "报词方式",
  [KEY_DICTATION]: "默写设置",
  [KEY_SYNC_MODE]: "同步策略",
  [KEY_CHAPTER_COLLAPSED]: "章节折叠状态",
  [KEY_WORD_COLLAPSED]: "单词折叠状态",
  [KEY_CHAPTER_MODE]: "章节列表模式",
  [KEY_WORD_MODE]: "单词列表模式",
});

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
