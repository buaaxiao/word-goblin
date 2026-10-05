/* ===================================================================
 * js/logger.js — 统一运行日志
 *
 * 依赖第三方库：lib/loglevel.min.js（v1.9.2，MIT，
 *   https://github.com/pimterry/loglevel），提供日志级别控制与命名 logger。
 *   本文件负责「落盘 + 导出文件」这部分 loglevel 不提供的能力。
 *
 * 管道结构：
 *   console.*（浏览器原生调用，保留原样打印）
 *        └─► 按当前级别决定是否收录 ──┐
 *   loglevel 命名 logger（受级别过滤）─┤
 *        └─► 自定义 methodFactory ────┴─► 内存缓冲
 *                                          └─► 批量落盘 IndexedDB logs 仓库
 *                                                └─► 导出 .log 文件
 *
 * 能力：
 *   1. 级别控制：由 loglevel 管理，可运行期切换并持久化
 *      （localStorage 键 "loglevel"，见设置 → 系统设置 → 日志级别）。
 *      · 命名 logger：低于当前级别的调用既不打印也不记录（loglevel 原生语义）
 *      · console.*   ：始终打印到浏览器控制台，只有达到级别的才写入日志文件
 *   2. 命名 logger：业务代码统一用 Log.getLogger("storage").info(...) 或
 *      Log.info("storage", ...) 输出，标签即模块名
 *   3. 内存缓冲：保留最近 N 条（N = 可导出日志行数配置，范围 0 ~ 3000），供即时查看与兜底导出
 *   4. 落盘输出：批量写入 IndexedDB logs 仓库（上限同为 N 条，自动裁剪最旧）
 *   5. 文件输出：Log.export() / exportLogFile() 导出 .log 文件（最多 N 行）
 *   6. 全局兜底：捕获 window.onerror / unhandledrejection
 *
 * 用法：
 *   Log.info("storage", "保存完成", diff)             // 带模块标签
 *   Log.debug / Log.warn / Log.error                 // 同上
 *   const log = Log.getLogger("dict"); log.warn("…")  // 命名 logger
 *   Log.setLevel("warn") / Log.getLevelName()        // 切换 / 读取级别
 *   Log.flush() / Log.count() / Log.export() / Log.clear()
 *   changeLogMaxLines() / getLogMaxLines()           // 可导出日志行数（0 ~ 3000）
 *
 * 配置持久化：日志级别 / 可导出日志行数走 config.js 统一体系
 *   （IndexedDB settings 仓库 + localStorage 兜底，键见 constants.js
 *   KEY_LOG_LEVEL / KEY_LOG_MAX_LINES），存储层就绪后由 applyLogConfig()
 *   应用到运行时。
 *
 * 依赖：db.js（dbPutLogs / dbGetAllLogs / dbCountLogs / dbClearLogs / dbPruneLogs）
 *       未就绪时自动降级为「仅 console + 内存」，不影响主流程。
 * =================================================================== */
"use strict";

/* =================================================================
 * 常量
 * ================================================================= */
/** 可导出日志行数的默认值 / 下限 / 上限 */
const LOG_MAX_LINES_DEFAULT = 1000; // 默认：内存缓冲 / IndexedDB 落盘 / 导出文件统一按此裁剪
const LOG_MAX_LINES_MIN = 0; // 最小值：0 表示不保留运行日志（不落盘不导出）
const LOG_MAX_LINES_MAX = 3000; // 最大值：可导出日志行数上限
const LOG_FLUSH_MS = 800; // 批量落盘间隔（毫秒）
const LOG_DEFAULT_LEVEL = "INFO"; // 未持久化过级别时的默认级别

/** 内部级别名 → 与 loglevel.levels 对齐的数值 */
const LOG_LEVEL_NUM = Object.freeze({
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
});

/** 数值 → 级别名（与 loglevel.levels 的键小写形式一致） */
const LOG_LEVEL_NAMES = ["trace", "debug", "info", "warn", "error", "silent"];

/** 默认日志级别（小写，与 loglevel.setLevel 入参一致） */
const LOG_LEVEL_DEFAULT = "info";

/** 设置界面用：级别清单（value 直接传给 loglevel.setLevel） */
const LOG_LEVEL_DEF = Object.freeze([
  { key: "TRACE", value: "trace", label: "TRACE 最详细" },
  { key: "DEBUG", value: "debug", label: "DEBUG 调试" },
  { key: "INFO", value: "info", label: "INFO 信息（默认）" },
  { key: "WARN", value: "warn", label: "WARN 警告" },
  { key: "ERROR", value: "error", label: "ERROR 错误" },
  { key: "SILENT", value: "silent", label: "SILENT 不记录" },
]);

const LOG_LEVEL_LABELS = Object.freeze(
  Object.fromEntries(LOG_LEVEL_DEF.map((d) => [d.value, d.label])),
);

/** loglevel 方法名 → 内部级别名 */
const LOG_METHOD_LEVEL = Object.freeze({
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
});

/** loglevel 方法名 → 原生 console 方法名 */
const LOG_METHOD_CONSOLE = Object.freeze({
  trace: "debug",
  debug: "debug",
  info: "log",
  warn: "warn",
  error: "error",
});

/* =================================================================
 * 可导出日志行数（运行时读取 config，未加载时用默认值）
 * ================================================================= */
/** 把任意输入钳制到合法行数范围 [MIN, MAX]，非法值回退默认 */
function clampLogMaxLines(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return LOG_MAX_LINES_DEFAULT;
  if (n < LOG_MAX_LINES_MIN) return LOG_MAX_LINES_MIN;
  if (n > LOG_MAX_LINES_MAX) return LOG_MAX_LINES_MAX;
  return n;
}

/* =================================================================
 * 日志归一化（对外统一接口）
 *   供 config-storage.js 等在持久化/序列化时调用；
 *   常量层 constants.js 不再重复定义，本文件是日志归一化唯一源头。
 * ================================================================= */

/** 归一化日志级别：非法值 → LOG_LEVEL_DEFAULT */
function normalizeLogLevel(v) {
  return normalizeLogLevelSafe(v);
}

/** 归一化日志行数：非法/越界 → 夹到 [MIN, MAX]，NaN → 默认 */
function normalizeLogMaxLines(v) {
  return clampLogMaxLines(v);
}

/**
 * 当前有效行数上限：优先用 config.logMaxLines（持久化配置），
 * 否则回退默认值。config 由 config.js 在应用启动时异步加载，
 * 在此之前记录/裁剪仍按默认值工作。
 */
function _logMaxLines() {
  if (
    typeof config !== "undefined" &&
    config &&
    typeof config.logMaxLines === "number" &&
    config.logMaxLines >= 0
  ) {
    return clampLogMaxLines(config.logMaxLines);
  }
  return LOG_MAX_LINES_DEFAULT;
}

/* =================================================================
 * 内部状态
 * ================================================================= */
let __logMemory = []; // 当前会话内存缓冲：[{ ts, level, msg }]
let __logQueue = []; // 待落盘队列
let __logFlushTimer = null; // 批量落盘定时器
let __logHooked = false; // console 是否已接管
let __logSuppress = false; // 防止「记录日志 → 打印日志 → 再记录」的递归
let __logOriginals = null; // 原生 console 方法
let __logInited = false; // Log.init 是否已执行
let __logLoglevel = null; // loglevel 根 logger（window.log）

/* =================================================================
 * 格式化工具
 * ================================================================= */
/** 取带毫秒的时间戳：2026-09-22 12:00:00.123 */
function _logNow() {
  const d = new Date();
  const p = (n, w) => String(n).padStart(w || 2, "0");
  return (
    d.getFullYear() +
    "-" +
    p(d.getMonth() + 1) +
    "-" +
    p(d.getDate()) +
    " " +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes()) +
    ":" +
    p(d.getSeconds()) +
    "." +
    p(d.getMilliseconds(), 3)
  );
}

/** 把单个日志参数转成可读文本（对象走 JSON，异常带堆栈） */
function _logFormatValue(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const t = typeof v;
  if (t === "string") return v;
  if (t === "number" || t === "boolean" || t === "bigint") return String(v);
  if (t === "function") return "[Function " + (v.name || "anonymous") + "]";
  if (v instanceof Error) {
    return (
      (v.name || "Error") +
      ": " +
      (v.message || "") +
      (v.stack ? "\n" + v.stack : "")
    );
  }
  try {
    return JSON.stringify(v);
  } catch (e) {
    try {
      return String(v);
    } catch (e2) {
      return "[Unserializable]";
    }
  }
}

/** 把参数列表拼成一条日志文本 */
function _logFormatArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) out.push(_logFormatValue(args[i]));
  return out.join(" ");
}

/** 给参数列表加上 "[name] " 前缀 */
function _logPrefixArgs(prefix, args) {
  const list = Array.prototype.slice.call(args);
  if (typeof list[0] === "string") list[0] = prefix + list[0];
  else if (prefix) list.unshift(prefix);
  return list;
}

/* =================================================================
 * 级别（由 loglevel 提供，不可用时回退 INFO）
 * ================================================================= */
/** 当前落盘阈值（数值，越小越详细） */
function _logPersistThreshold() {
  if (__logLoglevel && typeof __logLoglevel.getLevel === "function") {
    return __logLoglevel.getLevel();
  }
  return LOG_LEVEL_NUM[LOG_DEFAULT_LEVEL];
}

/** 数值 → 级别名（小写） */
function _logLevelName(n) {
  return LOG_LEVEL_NAMES[n] || LOG_LEVEL_NAMES[LOG_LEVEL_NUM[LOG_DEFAULT_LEVEL]];
}

/** 该级别是否达到落盘阈值 */
function _logShouldPersist(level) {
  const n = LOG_LEVEL_NUM[level];
  return typeof n === "number" && n >= _logPersistThreshold();
}

/* =================================================================
 * 记录 / 落盘
 * ================================================================= */
/** 记录一条日志：进内存缓冲 + 按级别阈值入落盘队列 */
function _logRecord(level, args) {
  const entry = {
    ts: _logNow(),
    level: level,
    msg: _logFormatArgs(args),
  };

  // ★ 行数配置为 0：不保留运行日志（内存与落盘都不写入）
  if (_logMaxLines() <= 0) return entry;

  __logMemory.push(entry);
  if (__logMemory.length > _logMaxLines()) {
    __logMemory.splice(0, __logMemory.length - _logMaxLines());
  }

  if (_logShouldPersist(level)) {
    __logQueue.push({ ts: entry.ts, level: entry.level, msg: entry.msg });
    _logScheduleFlush();
  }

  return entry;
}

/** 记录 + 直接打印（供全局错误兜底使用，绕开 console 包装避免二次记录） */
function _logRecordAndPrint(level, args) {
  const key = level === "ERROR" ? "error" : "warn";
  if (__logOriginals && __logOriginals[key]) {
    try {
      __logOriginals[key].apply(null, args);
    } catch (e) {}
  }
  try {
    _logRecord(level, args);
  } catch (e) {}
}

/** 安排一次批量落盘（合并 800ms 内的所有日志，减少事务次数） */
function _logScheduleFlush() {
  if (__logFlushTimer) return;
  __logFlushTimer = setTimeout(function () {
    __logFlushTimer = null;
    _logFlush();
  }, LOG_FLUSH_MS);
}

/** 把待落盘队列写入 IndexedDB，并按上限裁剪旧记录 */
async function _logFlush() {
  if (!__logQueue.length) return 0;
  if (typeof dbPutLogs !== "function") {
    __logQueue.length = 0; // 数据库层不可用 → 放弃落盘（console 已有输出）
    return 0;
  }

  const batch = __logQueue.splice(0, __logQueue.length);
  try {
    await dbPutLogs(batch);
    if (typeof dbPruneLogs === "function") await dbPruneLogs(_logMaxLines());
    return batch.length;
  } catch (e) {
    // 落盘失败：丢弃本批，避免队列无限堆积
    if (__logOriginals) {
      try {
        __logOriginals.error("[logger] 日志落盘失败：", e);
      } catch (e2) {}
    }
    return 0;
  }
}

/* =================================================================
 * console 接管（收录浏览器原生 console 调用）
 *   ★ 始终打印：不做级别过滤，避免 DevTools 少输出
 *   ★ 只有达到级别阈值的才写入日志文件（见 _logShouldPersist）
 * ================================================================= */
function _logInstallConsole() {
  if (__logHooked || typeof console === "undefined") return;
  __logHooked = true;

  __logOriginals = {
    log: console.log.bind(console),
    debug: (console.debug || console.log).bind(console),
    info: (console.info || console.log).bind(console),
    warn: (console.warn || console.log).bind(console),
    error: (console.error || console.log).bind(console),
  };

  const wrap = function (level, key) {
    return function () {
      try {
        __logOriginals[key].apply(null, arguments);
      } catch (e) {}
      if (__logSuppress) return;
      __logSuppress = true;
      try {
        _logRecord(level, arguments);
      } catch (e) {
      } finally {
        __logSuppress = false;
      }
    };
  };

  console.log = wrap("INFO", "log");
  console.info = wrap("INFO", "info");
  console.debug = wrap("DEBUG", "debug");
  console.warn = wrap("WARN", "warn");
  console.error = wrap("ERROR", "error");
}

/* =================================================================
 * loglevel 接入（级别控制 + 命名 logger）
 * ================================================================= */
function _logInstallLoglevel() {
  if (typeof window === "undefined") return;

  __logLoglevel = window.log || null;
  if (!__logLoglevel || typeof __logLoglevel.methodFactory === "undefined") {
    // ★ 此处刻意用原生 console：loglevel 尚未就绪，Log.* 只能走降级分支
    console.warn(
      "[logger] 未加载 lib/loglevel.min.js，级别控制降级为固定 " +
        LOG_DEFAULT_LEVEL,
    );
    return;
  }

  // ★ 必须在任何 getLogger() 之前替换 methodFactory：
  //   子 logger 创建时会复制根 logger 当时的 methodFactory
  __logLoglevel.methodFactory = function (methodName, logLevel, loggerName) {
    const level = LOG_METHOD_LEVEL[methodName] || "INFO";
    const consoleKey = LOG_METHOD_CONSOLE[methodName] || "log";
    const prefix = loggerName ? "[" + loggerName + "] " : "";

    return function () {
      const args = _logPrefixArgs(prefix, arguments);
      if (__logOriginals && __logOriginals[consoleKey]) {
        try {
          __logOriginals[consoleKey].apply(null, args);
        } catch (e) {}
      }
      _logRecord(level, args);
    };
  };

  // 没有持久化过级别时用 INFO（DEBUG 不落盘，与引入 loglevel 之前一致）
  __logLoglevel.setDefaultLevel(LOG_DEFAULT_LEVEL);
  // 让根 logger 用新 factory 重建方法（loglevel 要求手动 rebuild）
  __logLoglevel.rebuild();
}

/** 降级用：loglevel 缺失时按同名 console + 记录实现一个 logger */
function _logFallbackLogger(name) {
  const call = function (method) {
    return function () {
      const list = Array.prototype.slice.call(arguments);
      return Log[method].apply(null, [name].concat(list));
    };
  };
  return {
    trace: call("debug"),
    debug: call("debug"),
    log: call("debug"),
    info: call("info"),
    warn: call("warn"),
    error: call("error"),
  };
}

/* =================================================================
 * 全局错误兜底
 * ================================================================= */
function _logInstallGlobalHandlers() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", function (e) {
    _logRecordAndPrint("ERROR", [
      "[window.onerror] " +
        (e && e.message ? e.message : "未知错误") +
        " @ " +
        (e && e.filename ? e.filename : "") +
        ":" +
        (e && e.lineno ? e.lineno : 0) +
        ":" +
        (e && e.colno ? e.colno : 0),
      e && e.error,
    ]);
  });

  window.addEventListener("unhandledrejection", function (e) {
    _logRecordAndPrint("ERROR", ["[unhandledrejection]", e && e.reason]);
  });

  // 页面隐藏 / 卸载前尽量把队列写完
  window.addEventListener("pagehide", function () {
    _logFlush();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") _logFlush();
  });
}

/* =================================================================
 * 对外 API
 * ================================================================= */
const Log = {
  /** 写入 DEBUG 日志（TRACE/DEBUG 级别的命名 logger 输出） */
  debug: function () {
    return _logViaLoglevel("debug", arguments);
  },
  /** 写入 INFO 日志 */
  info: function () {
    return _logViaLoglevel("info", arguments);
  },
  /** 写入 WARN 日志 */
  warn: function () {
    return _logViaLoglevel("warn", arguments);
  },
  /** 写入 ERROR 日志 */
  error: function () {
    return _logViaLoglevel("error", arguments);
  },

  /** 取（或创建）命名 logger：Log.getLogger("storage").info("…") */
  getLogger: function (name) {
    const key = name ? String(name) : "app";
    if (__logLoglevel && typeof __logLoglevel.getLogger === "function") {
      return __logLoglevel.getLogger(key);
    }
    return _logFallbackLogger(key);
  },

  /** 设置日志级别（level 可为 "debug"/"info"/… 或 loglevel 数值） */
  setLevel: function (level, persist) {
    if (!__logLoglevel) return Log.getLevelName();
    __logLoglevel.setLevel(String(level), persist !== false); // 默认持久化
    __logLoglevel.rebuild(); // 让已创建的命名 logger 继承新级别
    return Log.getLevelName();
  },

  /** 当前级别数值（与 loglevel.levels 一致） */
  getLevel: function () {
    return _logPersistThreshold();
  },

  /** 当前级别名（小写，如 "info"） */
  getLevelName: function () {
    return _logLevelName(_logPersistThreshold());
  },

  /** 初始化：接管 console、接入 loglevel、挂全局错误、读历史日志数量 */
  init: async function () {
    _logInstallConsole();
    if (__logInited) return;
    __logInited = true;

    try {
      const rows =
        typeof dbGetAllLogs === "function" ? await dbGetAllLogs() : [];
      Log.info(
        "logger",
        "日志模块就绪：历史日志 " +
          rows.length +
          " 条 · 当前级别 " +
          Log.getLevelName().toUpperCase(),
      );
    } catch (e) {
      Log.warn("logger", "读取历史日志失败：", e);
    }
  },

  /** 立即落盘（返回写入条数） */
  flush: _logFlush,

  /** 已落盘日志条数（数据库不可用时回退为内存条数） */
  count: async function () {
    if (typeof dbCountLogs === "function") {
      try {
        return await dbCountLogs();
      } catch (e) {}
    }
    return __logMemory.length;
  },

  /** 导出为 .log 文件（优先用落盘数据，保证跨会话完整） */
  export: async function () {
    await _logFlush();

    let rows = null;
    if (typeof dbGetAllLogs === "function") {
      try {
        rows = await dbGetAllLogs();
      } catch (e) {
        rows = null;
      }
    }
    if (!rows || !rows.length) rows = __logMemory.slice();
    // 导出上限：只导出最新 _logMaxLines() 行
    if (rows.length > _logMaxLines()) rows = rows.slice(-_logMaxLines());

    const lines = [];
    lines.push("# 单词精灵运行日志");
    lines.push("# 导出时间: " + _logNow());
    lines.push("# 日志级别: " + Log.getLevelName().toUpperCase());
    lines.push("# 导出行数上限: " + _logMaxLines());
    lines.push("# 条目数: " + rows.length);
    lines.push("# 格式: 时间 [级别] 内容（异常堆栈跟随其后）");
    lines.push("");
    rows.forEach(function (r) {
      lines.push((r.ts || "") + " [" + (r.level || "") + "] " + (r.msg || ""));
    });

    const blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const stamp = _logNow().replace(/[-:. ]/g, "");
    const filename = "word-goblin-log-" + stamp + ".log";

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return rows.length;
  },

  /** 清空内存缓冲与落盘日志 */
  clear: async function () {
    __logQueue.length = 0;
    __logMemory.length = 0;
    if (typeof dbClearLogs === "function") {
      try {
        await dbClearLogs();
      } catch (e) {}
    }
  },
};

/**
 * Log.xxx(tag, ...) → loglevel 命名 logger
 *   第一个参数为模块标签；低于当前级别时既不打印也不记录（loglevel 语义）
 */
function _logViaLoglevel(method, args) {
  const list = Array.prototype.slice.call(args);
  const name = list.length ? String(list.shift()) : "app";

  if (__logLoglevel && typeof __logLoglevel.getLogger === "function") {
    const lg = __logLoglevel.getLogger(name);
    return lg[method].apply(lg, list);
  }
  // 降级：原生 console + 记录
  return _logEmitDirect(
    LOG_METHOD_LEVEL[method] || "INFO",
    LOG_METHOD_CONSOLE[method] || "log",
    _logPrefixArgs(name ? "[" + name + "] " : "", list),
  );
}

/** 降级出口：直接打印 + 记录（loglevel 不可用时使用） */
function _logEmitDirect(level, consoleKey, args) {
  if (__logOriginals && __logOriginals[consoleKey]) {
    try {
      __logOriginals[consoleKey].apply(null, args);
    } catch (e) {}
  }
  return _logRecord(level, args);
}

/* =================================================================
 * 设置弹窗入口（供内联 onclick 调用）
 * ================================================================= */
/** 切换日志级别（custom-select 回调） */
function pickLogLevel(value) {
  if (typeof setCustomSelectValue === "function") {
    setCustomSelectValue("logLevelSelect", value);
  }
  if (typeof _closeAllCustomSelects === "function") _closeAllCustomSelects();

  // ★ 运行时切换（不持久化到 loglevel 的 localStorage），持久化走 config 体系
  const applied = Log.setLevel(value, false);
  if (
    typeof setConfig === "function" &&
    typeof KEY_LOG_LEVEL !== "undefined"
  ) {
    setConfig(KEY_LOG_LEVEL, applied);
  }
  Log.info(
    "logger",
    "日志级别已切换为 " +
      applied.toUpperCase() +
      "：低于该级别的日志不写入日志文件",
  );
  refreshLogInfo();
}

/** 当前级别的小写名（设置界面渲染用） */
function getLogLevelName() {
  return Log.getLevelName();
}

/** 当前可导出日志行数（设置界面渲染用） */
function getLogMaxLines() {
  return _logMaxLines();
}

/**
 * 修改可导出日志行数（number input 回调）
 *   合法范围 0 ~ 3000（0 表示不保留运行日志）；改变后立即按新上限裁剪内存与落盘日志，并持久化。
 */
function changeLogMaxLines() {
  const el = document.getElementById("logMaxLinesInput");
  if (!el) return;
  let n = parseInt(el.value, 10);
  if (Number.isNaN(n)) n = LOG_MAX_LINES_DEFAULT;
  n = clampLogMaxLines(n);
  el.value = n;

  if (
    typeof config !== "undefined" &&
    config &&
    typeof setConfig === "function" &&
    typeof KEY_LOG_MAX_LINES !== "undefined"
  ) {
    setConfig(KEY_LOG_MAX_LINES, n);
  }

  // 立即按新上限裁剪，避免旧数据超过新限制
  if (__logMemory.length > n) {
    __logMemory.splice(0, __logMemory.length - n);
  }
  if (typeof dbPruneLogs === "function") {
    dbPruneLogs(n).catch(function () {});
  }

  Log.info("logger", "可导出日志行数调整为 " + n + " 行（上限 3000）");
  refreshLogInfo();
}

/**
 * 应用日志配置到运行时（启动时存储层就绪后调用）
 *   · 日志级别：从 config 读取并应用（不写 loglevel 的 localStorage）
 *   · 持久化迁移：老版本 loglevel 直接写 localStorage "loglevel"，
 *     首次迁移到 config 体系后统一走 IndexedDB + localStorage。
 */
function applyLogConfig() {
  if (typeof config === "undefined" || !config) return;

  // ★ 一次性迁移：config 尚未设置过级别、但存在旧 loglevel 持久化级别时接管
  if (!window.__logLevelMigrated) {
    window.__logLevelMigrated = true;
    try {
      const oldRaw = localStorage.getItem("loglevel");
      if (
        oldRaw &&
        typeof KEY_LOG_LEVEL !== "undefined" &&
        config.logLevel === String(LOG_DEFAULT_LEVEL).toLowerCase() &&
        typeof LOG_LEVEL_LABELS !== "undefined" &&
        LOG_LEVEL_LABELS[String(oldRaw).toLowerCase()]
      ) {
        config.logLevel = String(oldRaw).toLowerCase();
        if (typeof persistConfigKey === "function") {
          persistConfigKey(KEY_LOG_LEVEL);
        }
      }
    } catch (e) {}
  }

  // 应用级别：session / 运行期生效，持久化已由 config 体系负责
  if (typeof Log.setLevel === "function") {
    Log.setLevel(normalizeLogLevelSafe(config.logLevel || "info"), false);
  }

  // 行数：内存缓冲按新上限收敛（下次记录时自然裁剪；落盘由 dbPruneLogs 处理）
  const n = _logMaxLines();
  if (__logMemory.length > n) {
    __logMemory.splice(0, __logMemory.length - n);
  }
}

/** 安全归一化日志级别（logger 内部用，避免依赖 config.js 的 normalizeLogLevel） */
function normalizeLogLevelSafe(v) {
  const s = String(v == null ? "" : v).toLowerCase();
  if (typeof LOG_LEVEL_LABELS !== "undefined" && LOG_LEVEL_LABELS[s]) return s;
  return String(LOG_DEFAULT_LEVEL).toLowerCase();
}

/** 导出日志 */
async function exportLogFile() {
  try {
    const n = await Log.export();
    Log.info("logger", "已导出日志，共 " + n + " 条");
    if (typeof toast === "function") toast("已导出日志：" + n + " 条");
    refreshLogInfo();
  } catch (e) {
    Log.error("logger", "导出日志失败：", e);
    if (typeof toast === "function") {
      toast("导出日志失败：" + (e && e.message ? e.message : e));
    }
  }
}

/** 清空日志（带确认框） */
function clearLogFile() {
  const doClear = async function () {
    await Log.clear();
    Log.warn("logger", "运行日志已清空");
    if (typeof toast === "function") toast("日志已清空");
    refreshLogInfo();
  };

  if (typeof openConfirmModal === "function") {
    openConfirmModal({
      title: "清空日志",
      body: "确定清空全部运行日志吗？<br>此操作不可撤销。",
      danger: true,
      okTitle: "清空",
      onOk: function () {
        doClear();
      },
    });
    return;
  }
  doClear();
}

/** 刷新设置弹窗里的日志条数提示 */
async function refreshLogInfo() {
  const el = document.getElementById("logHintText");
  if (!el) return;
  await Log.flush(); // 先把待落盘队列写掉，保证条数准确
  const n = await Log.count();
  el.textContent =
    "已记录 " +
    n +
    " 条运行日志（当前级别 " +
    Log.getLevelName().toUpperCase() +
    "，最多保留 " +
    _logMaxLines() +
    " 条，可配置为 0 ~ 3000 行），可导出为 .log 文件用于排查问题。";
}

/* =================================================================
 * 启动即接管 console / 接入 loglevel（必须先于其它脚本加载）
 * ================================================================= */
_logInstallConsole();
_logInstallGlobalHandlers();
_logInstallLoglevel();
