/* ===================================================================
 * js/config-base.js — 常量/配置系统基础设施（通用，无项目数据）
 *
 *   只提供机制：
 *     · 通用工具           freeze / freezeValue / enumMap / labelsByValue / toAttr
 *     · 枚举注册器         enumDef / labelDef
 *     · 字段注册器         fieldDef
 *     · 设置键注册器       settingDef
 *     · 扁平表解析+校验    parseEnumItems / parseFieldItems / parseSettingItems
 *     · 组装与挂载         buildConstants
 *     · 一站式入口         defineConstants
 *
 *   上层（config.js）写两张扁平表：
 *     ENUM_ITEMS     枚举值条目（含 is_default 默认项标记）
 *     SETTING_ITEMS  设置键（defaults = 普通项默认值；枚举项只写 name/label）
 *
 *   枚举默认项由 ENUM_ITEMS 中 is_default: true 的条目决定，
 *   defineConstants 不再需要额外容器声明。
 *
 *   必须最先加载（在 config.js 之前）
 * =================================================================== */
"use strict";

/* =================================================================
 * 通用工具
 * ================================================================= */
const freeze = (o) => Object.freeze(o);

/** 对象才冻结，标量原样返回（支持 defaults: 0 / "" / false） */
const freezeValue = (v) =>
  v !== null && typeof v === "object" ? Object.freeze(v) : v;

const enumMap = (def) =>
  freeze(Object.fromEntries(def.map((d) => [d.key, d.value])));
const labelsByValue = (def) =>
  freeze(Object.fromEntries(def.map((d) => [d.value, d.label])));

/** 强制驼峰推导：CHAPTER_COLLAPSED → chapterCollapsed */
const toAttr = (name) =>
  name.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/* =================================================================
 * 注册表（模块级单例，供上层填充）
 * ================================================================= */
const ENUM_REGISTRY = new Map(); // name -> { def, map?, labels, defaultKey? }
const FIELD_REGISTRY = new Map(); // name -> { def, labels }
const SETTING_REGISTRY = new Map(); // name -> { key, label, defaults?, defaultKey? }

/* =================================================================
 * A. 枚举 / 字段注册器
 * ================================================================= */

/** 普通枚举（key ≠ value） */
function enumDef(name, defArray, defaultKey) {
  const def = freeze(defArray);
  ENUM_REGISTRY.set(name, {
    def,
    map: enumMap(def),
    labels: labelsByValue(def),
    defaultKey,
  });
}

/** 纯标签枚举（key === value） */
function labelDef(name, defArray, defaultKey) {
  const def = freeze(defArray);
  ENUM_REGISTRY.set(name, { def, labels: labelsByValue(def), defaultKey });
}

/** 字段元数据（不生成 map / default，仅提供 DEF + LABELS） */
function fieldDef(name, defArray) {
  const def = freeze(defArray);
  FIELD_REGISTRY.set(name, { def, labels: labelsByValue(def) });
}

/* =================================================================
 * B. 设置键注册器
 * ================================================================= */
let KEY_PREFIX = "";
let KEY_SUFFIX = "";

/**
 * 设置键
 *   → KEYS.<NAME> = { key, label[, defaults] }
 *   → KEY_<NAME> 全局短名
 * @param {string} name
 * @param {string} label
 * @param {*}      [defaults] 默认值（对象自动冻结，标量原样）
 */
function settingDef(name, label, defaults) {
  const mid = toAttr(name);
  SETTING_REGISTRY.set(name, {
    key: KEY_PREFIX + mid + KEY_SUFFIX,
    label,
    defaults: freezeValue(defaults),
  });
}

/* =================================================================
 * C. 扁平表解析 + 校验 + 注册
 * ================================================================= */

/**
 * 解析设置键扁平表 → 注册
 *
 *   条目：{ name, label, defaults? }
 *     · defaults   普通设置项自身的默认值（任意类型）
 *
 *   枚举型设置项（其中 name 同时也是枚举容器名）不写 defaults，
 *   SETTINGS_DEFAULTS 中的默认值由 ENUM_REGISTRY（其 default 来自
 *   ENUM_ITEMS 的 is_default 标记）在 buildConstants 中回填。
 */
function parseSettingItems(items, opts = {}) {
  const { validate = true } = opts;

  if (validate) {
    const names = new Set();
    for (const { name } of items) {
      if (names.has(name)) throw new Error(`[setting:${name}] duplicate name`);
      names.add(name);
    }
  }

  for (const { name, label, defaults } of items) {
    settingDef(name, label, defaults);
  }
}

/**
 * 解析枚举值表 → 分组 → 推导默认项/kind → 校验 → 注册
 *
 *   值条目：{ container_name, key, value, label, is_default? }
 *   每容器至多一个 is_default: true 的条目，其 key 即该容器默认项，
 *   用于生成 <NAME>_DEFAULT 与回填 SETTINGS_DEFAULTS。
 *   kind 由值条目自动推导（key === value → "label"，否则 → "enum"）。
 *
 * @param {Array}  items
 * @param {Object} [opts]
 * @param {boolean}[opts.validate=true]
 */
function parseEnumItems(items, opts = {}) {
  const { validate = true } = opts;

  const groups = new Map(); // container_name -> [ { key, value, label, isDefault } ]

  for (const item of items) {
    const { container_name, key, value, label, is_default } = item;
    if (key === undefined) {
      throw new Error(`[enum:${container_name}] 条目缺少 key`);
    }
    if (!groups.has(container_name)) groups.set(container_name, []);
    groups.get(container_name).push({
      key,
      value,
      label,
      isDefault: is_default === true,
    });
  }

  const meta = new Map();
  for (const [name, def] of groups) {
    const defaults = def.filter((d) => d.isDefault);
    if (defaults.length > 1)
      throw new Error(`[enum:${name}] 存在多个 is_default: true 条目`);
    const kind = def.every((d) => d.key === d.value) ? "label" : "enum";
    meta.set(name, {
      kind,
      default: defaults.length ? defaults[0].key : undefined,
    });
  }

  if (validate) {
    for (const [name, def] of groups) {
      const keys = new Set();
      const values = new Set();

      for (const { key, value } of def) {
        if (keys.has(key))
          throw new Error(`[enum:${name}] duplicate key: ${key}`);
        if (values.has(value))
          throw new Error(`[enum:${name}] duplicate value: ${value}`);
        keys.add(key);
        values.add(value);
      }

      if (def.length === 0)
        throw new Error(`[enum:${name}] has no value entries`);

      const m = meta.get(name);
      if (m.default !== undefined && !keys.has(m.default))
        throw new Error(`[enum:${name}] default "${m.default}" not found`);
    }
  }

  for (const [name, def] of groups) {
    const { default: defKey, kind } = meta.get(name);
    if (kind === "label") labelDef(name, def, defKey);
    else enumDef(name, def, defKey);
  }

  return { groups, meta };
}

/**
 * 解析字段元数据表 → 分组 → 注册
 *
 *   条目：{ container_name, key, value, label }
 *   与枚举不同：不参与容器 default 推导，只生成 <NAME>_DEF / <NAME>_LABELS。
 *
 * @param {Array}  items
 * @param {Object} [opts]
 * @param {boolean}[opts.validate=true]
 */
function parseFieldItems(items, opts = {}) {
  const { validate = true } = opts;
  const groups = new Map();

  for (const item of items) {
    const { container_name, key, value, label } = item;
    if (!groups.has(container_name)) groups.set(container_name, []);
    groups.get(container_name).push({ key, value, label });
  }

  if (validate) {
    for (const [name, def] of groups) {
      const keys = new Set();
      for (const { key } of def) {
        if (keys.has(key))
          throw new Error(`[field:${name}] duplicate key: ${key}`);
        keys.add(key);
      }
      if (def.length === 0) throw new Error(`[field:${name}] has no entries`);
    }
  }

  for (const [name, def] of groups) fieldDef(name, def);

  return { groups };
}

/* =================================================================
 * D. 组装与挂载
 * ================================================================= */

/**
 * 由注册表组装冻结的 KEYS，并挂载全部全局派生量。
 *
 * @param {object} [opts]
 * @param {string} [opts.dataDir="data"]
 * @param {string} [opts.dataFile="data.json"]
 * @param {string} [opts.keyPrefix]
 * @param {string} [opts.keySuffix]
 * @param {object} [opts.aliases]
 * @returns {object} 冻结的 KEYS
 */
function buildConstants(opts = {}) {
  const {
    dataDir = "data",
    dataFile = "data.json",
    keyPrefix,
    keySuffix,
    aliases = {},
  } = opts;

  if (keyPrefix !== undefined) KEY_PREFIX = keyPrefix;
  if (keySuffix !== undefined) KEY_SUFFIX = keySuffix;

  /* ---- 组装 KEYS ---- */
  const KEYS = freeze({
    DATA_DIR: dataDir,
    DATA_FILE: dataFile,

    /* 枚举段：DEF / map 全部挂上 */
    ...Object.fromEntries(
      [...ENUM_REGISTRY].flatMap(([name, e]) => [
        [name + "_DEF", e.def],
        ...(e.map ? [[name, e.map]] : []),
      ]),
    ),

    /* 字段段：仅 DEF */
    ...Object.fromEntries(
      [...FIELD_REGISTRY].map(([name, e]) => [name + "_DEF", e.def]),
    ),

    /* 设置键段 */
    ...Object.fromEntries(
      [...SETTING_REGISTRY].map(([name, e]) => [
        name,
        e.defaults !== undefined
          ? freeze({ key: e.key, label: e.label, defaults: e.defaults })
          : freeze({ key: e.key, label: e.label }),
      ]),
    ),

    /* 历史别名段 */
    ALIASES: freeze({ ...aliases }),
  });

  /* ---- 枚举全局量 ----
   * ★ _DEFAULT 取「默认项的 value」：
   *   enum 类：key → map → value（数值）
   *   label 类：key 即 value（字符串）
   */
  for (const [name, e] of ENUM_REGISTRY) {
    if (e.map) globalThis[name] = e.map;
    globalThis[name + "_DEF"] = e.def;
    globalThis[name + "_LABELS"] = e.labels;
    if (e.defaultKey) {
      globalThis[name + "_DEFAULT"] = e.map
        ? e.map[e.defaultKey]
        : e.defaultKey;
    }
  }

  /* ---- 字段全局量（仅 DEF + LABELS） ---- */
  for (const [name, e] of FIELD_REGISTRY) {
    globalThis[name + "_DEF"] = e.def;
    globalThis[name + "_LABELS"] = e.labels;
  }

  /* ---- 设置键短名 KEY_<NAME> ---- */
  for (const [name, e] of SETTING_REGISTRY) {
    Object.defineProperty(globalThis, "KEY_" + name, {
      value: e.key,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  /* ---- 数据源 URL ---- */
  globalThis.DATA_URL = KEYS.DATA_DIR + "/" + KEYS.DATA_FILE;

  /* ---- 设置键清单 ---- */
  globalThis.SETTINGS_KEYS = freeze(
    [...SETTING_REGISTRY.values()].map((e) => e.key),
  );

  /* ---- 设置键 → 标签 ---- */
  globalThis.SETTINGS_KEY_LABELS = freeze(
    Object.fromEntries(
      [...SETTING_REGISTRY.values()].map((e) => [e.key, e.label]),
    ),
  );

  /* ---- 各设置项默认值汇总（attr 驼峰键 → defaults） ----
   * ★ 普通设置项取 e.defaults；枚举型设置项从 ENUM_REGISTRY 取默认值。
   *   保证 SETTINGS_DEFAULTS 覆盖全部设置项，无 undefined。
   */
  globalThis.SETTINGS_DEFAULTS = freeze(
    Object.fromEntries(
      [...SETTING_REGISTRY]
        .map(([name, e]) => {
          if (e.defaults !== undefined) return [toAttr(name), e.defaults];

          const en = ENUM_REGISTRY.get(name);
          if (en && en.defaultKey !== undefined) {
            const defVal = en.map ? en.map[en.defaultKey] : en.defaultKey;
            return [toAttr(name), defVal];
          }
          return null;
        })
        .filter(Boolean),
    ),
  );

  /* ---- 历史别名挂载 ---- */
  Object.entries(KEYS.ALIASES).forEach(([alias, prop]) =>
    Object.defineProperty(globalThis, alias, {
      value: KEYS[prop],
      enumerable: false,
      configurable: false,
      writable: false,
    }),
  );

  return KEYS;
}

/* =================================================================
 * E. 一站式入口
 * ================================================================= */

/**
 * 顶层入口：解析扁平表 → 注册 → 组装挂载。
 *
 * @param {object}   opts
 * @param {Array}    opts.enumItems
 * @param {Array}    [opts.fieldItems]
 * @param {Array}    opts.settingItems
 * @param {object}   [opts.build]
 * @param {boolean}  [opts.validate=true]
 */
function defineConstants({
  enumItems,
  fieldItems = [],
  settingItems,
  build = {},
  validate = true,
}) {
  parseFieldItems(fieldItems, { validate });
  parseEnumItems(enumItems, { validate });
  parseSettingItems(settingItems, { validate });
  return buildConstants(build);
}

/* =================================================================
 * 导出到全局
 * ================================================================= */
globalThis.常量系统 = freeze({
  /* 工具 */
  freeze,
  freezeValue,
  enumMap,
  labelsByValue,
  toAttr,
  /* 注册器 */
  enumDef,
  labelDef,
  fieldDef,
  settingDef,
  /* 扁平表处理 */
  parseEnumItems,
  parseFieldItems,
  parseSettingItems,
  /* 组装 */
  buildConstants,
  /* 一站式 */
  defineConstants,
  /* 注册表（只读引用） */
  ENUM_REGISTRY,
  FIELD_REGISTRY,
  SETTING_REGISTRY,
});
