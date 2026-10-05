/* ===================================================================
 * js/config.js — 项目参数配置 + 常量系统组装
 *
 *   本文件承载"参数配置"，纯声明、无状态、无逻辑：
 *     · SETTING_ITEMS   设置键表（defaults）
 *     · KEYS            组装：常量系统.defineConstants
 *                        （挂载全部全局派生量，KEYS 仅用于调试引用）
 *
 *   枚举域（ENUM_ITEMS 值表 + is_default 默认项）见 constants.js；
 *   内存状态与持久化见 config-storage.js。
 *
 *   依赖：config-base.js（常量系统）
 *         constants.js（ENUM_ITEMS / LOG_MAX_LINES_DEFAULT）
 *   加载顺序：config-base.js → constants.js → config.js → config-storage.js
 * =================================================================== */
"use strict";

/* =================================================================
 * A. 参数配置：设置键表
 *
 *   条目：{ name, label, defaults? }
 *     · name       大写下划线，用于生成 KEY_<NAME>
 *     · label      界面展示用
 *     · defaults   普通设置项的默认值（任意类型）
 *
 *   枚举型设置项（THEME / DICT_LANG / DICT_MODE / PLAY_ORDER / SYNC_MODE）：
 *     · 不写 defaults；枚举值与默认项由 constants.js 的 ENUM_ITEMS
 *       （is_default 标记）声明，KEYS 组装时按同名容器自动关联
 *
 *   默写 5 项子设置（DICTATION_*）为独立普通设置项，不做容器。
 *
 *   注：LOG_LEVEL 级别清单由 logger.js 独立定义（logger 保持自洽），
 *       此处只把它作为普通设置项注册（defaults: "info"），不参与枚举容器推导。
 * ================================================================= */
const SETTING_ITEMS = [
  /* 枚举型设置项（默认项由 constants.js ENUM_ITEMS 的 is_default 提供） */
  { name: "THEME", label: "主题颜色模式" },
  { name: "DICT_LANG", label: "报词方式" },
  { name: "SYNC_MODE", label: "同步策略" },
  { name: "DICT_MODE", label: "默写范围" },
  { name: "PLAY_ORDER", label: "播报顺序" },

  /* 普通设置项 */
  { name: "DICTATION_INTERVAL_SEC", label: "默写播报间隔", defaults: 3, },
  { name: "DICTATION_REPEAT_COUNT", label: "每词遍数", defaults: 2, },
  { name: "DICTATION_REPEAT_INTERVAL_SEC", label: "每遍间隔", defaults: 1, },
  { name: "DICTATION_MODE", label: "默写范围", defaults: 0, },
  { name: "DICTATION_PLAY_ORDER", label: "播报顺序", defaults: 0, },
  { name: "CHAPTER_COLLAPSED", label: "章节折叠状态", defaults: {} },
  { name: "WORD_COLLAPSED", label: "单词折叠状态", defaults: {} },
  { name: "CHAPTER_MODE", label: "章节列表模式", defaults: "list" },
  { name: "WORD_MODE", label: "单词列表模式", defaults: "list" },
  { name: "LOG_LEVEL", label: "日志级别", defaults: "info" },
  { name: "LOG_MAX_LINES", label: "可导出日志行数", defaults: LOG_MAX_LINES_DEFAULT },
];

/* =================================================================
 * B. 组装：定义常量 + 挂载全局
 * ================================================================= */
const KEYS = 常量系统.defineConstants({
  enumItems: ENUM_ITEMS,
  settingItems: SETTING_ITEMS,
  build: {
    dataDir: "data",
    dataFile: "data.json",
    keyPrefix: "wordDictation.",
    keySuffix: ".v1",  },
});
