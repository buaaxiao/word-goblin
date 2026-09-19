/* =================================================================
 * js/settings-store.js — 设置导出 / 导入
 *   读写走 config；持久化由 config.js 负责
 *
 *   依赖：constants.js / config.js
 * =================================================================== */

/* =================================================================
 * 导出设置（确认对话框 + 真正导出）
 * =================================================================== */
function exportSettings() {
  if (typeof openConfirmModal !== "function") {
    doExportSettings();
    return;
  }
  openConfirmModal({
    title: "导出设置",
    body:
      "将导出以下设置到 JSON 文件：<br>" +
      "· 主题颜色模式<br>" +
      "· 报词方式<br>" +
      "· 默写设置（间隔 / 遍数 / 范围 / 顺序）<br>" +
      "· 列表折叠状态 / 显示模式<br><br>" +
      "确定导出吗？",
    okTitle: "导出",
    onOk: doExportSettings,
  });
}

function doExportSettings() {
  try {
    const obj = {
      [KEY_THEME]: config.theme,
      [KEY_DICT_LANG]: String(config.dictLang),
      [KEY_DICTATION]: JSON.stringify(config.dictation),
      [KEY_CHAPTER_COLLAPSED]: config.chapterCollapsed ? "1" : "0",
      [KEY_WORD_COLLAPSED]: config.wordCollapsed ? "1" : "0",
      [KEY_CHAPTER_MODE]: config.chapterMode,
      [KEY_WORD_MODE]: config.wordMode,
    };
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: obj,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = "word-goblin-settings-" + ts + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof toast === "function") toast("已导出设置");
  } catch (e) {
    console.error("导出设置失败：", e);
    if (typeof toast === "function")
      toast("导出设置失败：" + (e && e.message ? e.message : e));
  }
}

/* =================================================================
 * 导入设置（确认对话框 + 应用）
 * =================================================================== */
function importSettings() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const parsed = JSON.parse(ev.target.result);
        const obj =
          parsed && parsed.settings
            ? parsed.settings
            : parsed && typeof parsed === "object"
              ? parsed
              : null;
        if (!obj) {
          if (typeof toast === "function") toast("文件格式不正确");
          return;
        }

        if (typeof openConfirmModal === "function") {
          openConfirmModal({
            title: "导入设置",
            body:
              "将导入 " +
              SETTINGS_KEYS.filter((k) => obj[k] !== undefined).length +
              " 项设置，覆盖本地当前配置。<br>确定导入吗？",
            danger: true,
            okTitle: "导入",
            onOk: function () {
              doApplyImportedSettings(obj);
            },
          });
        } else {
          doApplyImportedSettings(obj);
        }
      } catch (err) {
        console.error("导入设置失败：", err);
        if (typeof toast === "function")
          toast("导入设置失败：" + (err && err.message ? err.message : err));
      }
    };
    reader.onerror = function () {
      if (typeof toast === "function") toast("读取文件失败");
    };
    reader.readAsText(file);
  };
  input.click();
}

function doApplyImportedSettings(obj) {
  try {
    let count = 0;
    for (const key of SETTINGS_KEYS) {
      if (obj[key] === undefined) continue;
      applyStoredSetting(key, obj[key]);
      persistConfigKey(key);
      count++;
    }

    // 应用 UI
    if (typeof loadTheme === "function") loadTheme();
    if (typeof loadCollapseState === "function") loadCollapseState();
    if (typeof applyCollapseState === "function") applyCollapseState();
    if (typeof applyModesUI === "function") applyModesUI();
    if (typeof renderChapterList === "function") renderChapterList();
    if (typeof renderWords === "function") renderWords();

    if (typeof toast === "function") toast("已导入 " + count + " 项设置");
  } catch (err) {
    console.error("应用导入设置失败：", err);
    if (typeof toast === "function")
      toast("应用导入设置失败：" + (err && err.message ? err.message : err));
  }
}
