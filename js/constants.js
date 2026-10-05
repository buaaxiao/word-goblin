/* ===================================================================
 * js/constants.js — 项目常量定义（枚举域，依赖 config-base.js 常量系统）
 *
 *   本文件只放"枚举相关常量"，无状态、无逻辑：
 *     · ENUM_ITEMS      枚举值条目（值表 + is_default 默认项标记）
 *
 *   日志归一化（normalizeLogLevel / normalizeLogMaxLines）由 logger.js
 *   提供（最先加载），本文件不重复定义，避免全局同名冲突。
 *   参数配置（SETTING_ITEMS 设置键表）与 KEYS 组装见 config.js；
 *   内存状态与持久化见 config-storage.js。
 *
 *   依赖：config-base.js（常量系统）
 *   加载顺序：config-base.js → constants.js → config.js → config-storage.js
 * =================================================================== */
"use strict";

/* =================================================================
 * 枚举值表
 *   值条目：{ container_name, key, value, label, is_default? }
 *     · is_default: true  该容器的默认项（每容器至多一个），
 *                         生成 <NAME>_DEFAULT 与 SETTINGS_DEFAULTS 默认值
 *     · kind 由值条目自动判断：key === value → "label"；否则 → "enum"
 * ================================================================= */
const ENUM_ITEMS = [
  /* THEME（label 类：key === value） */
  { container_name: "THEME", key: "auto", value: "auto", label: "🔄 跟随系统", is_default: true },
  { container_name: "THEME", key: "light", value: "light", label: "☀️ 浅色" },
  { container_name: "THEME", key: "dark", value: "dark", label: "🌙 深色" },

  /* DICT_LANG（enum 类：key ≠ value） */
  { container_name: "DICT_LANG", key: "ZH", value: 1, label: "汉语", is_default: true },
  { container_name: "DICT_LANG", key: "EN", value: 0, label: "English" },

  /* DICT_MODE（enum 类） */
  { container_name: "DICT_MODE", key: "ALL", value: 0, label: "全部单词", is_default: true },
  { container_name: "DICT_MODE", key: "WRONG", value: 1, label: "仅错题" },
  { container_name: "DICT_MODE", key: "LAST_WRONG", value: 2, label: "仅最后错误" },

  /* PLAY_ORDER（enum 类） */
  { container_name: "PLAY_ORDER", key: "SEQ", value: 0, label: "列表播报", is_default: true },
  { container_name: "PLAY_ORDER", key: "RANDOM", value: 1, label: "随机播报" },
  { container_name: "PLAY_ORDER", key: "LOOP", value: 2, label: "列表循环" },
  { container_name: "PLAY_ORDER", key: "SINGLE", value: 3, label: "单个播报" },
  { container_name: "PLAY_ORDER", key: "SINGLE_LOOP", value: 4, label: "单个循环" },

  /* SYNC_MODE（label 类：key === value） */
  { container_name: "SYNC_MODE", key: "merge", value: "merge", label: "合并更新（默认）", is_default: true },
  { container_name: "SYNC_MODE", key: "cloud_first", value: "cloud_first", label: "云端优先（保留本地独有）" },
  { container_name: "SYNC_MODE", key: "cloud_replace", value: "cloud_replace", label: "云端覆盖（删除本地独有）" },
  { container_name: "SYNC_MODE", key: "pull_only", value: "pull_only", label: "仅新增（不动已有）" },

  /* 注：LOG_LEVEL 级别清单（trace/debug/info/warn/error/silent）由 logger.js
   * 独立定义（logger 保持自洽），不在此处收敛，避免 logger 依赖本项目常量层。
   * 注：DICTATION_* 5 项子设置为普通设置项（非枚举），在 config.js 的
   * SETTING_ITEMS 中声明，此处不重复定义。
   */
];
