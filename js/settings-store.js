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
              return doApplyImportedSettings(obj);
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
    const applied = [];
    const skipped = [];

    for (const key of SETTINGS_KEYS) {
      const label = SETTINGS_KEY_LABELS[key] || key;
      if (obj[key] === undefined) {
        skipped.push(label);
        continue;
      }
      applyStoredSetting(key, obj[key]);
      persistConfigKey(key);
      applied.push(label);
    }

    // 应用 UI
    if (typeof loadTheme === "function") loadTheme();
    if (typeof loadCollapseState === "function") loadCollapseState();
    if (typeof applyCollapseState === "function") applyCollapseState();
    if (typeof applyModesUI === "function") applyModesUI();
    if (typeof renderChapterList === "function") renderChapterList();
    if (typeof renderWords === "function") renderWords();

    // ===== 结果弹窗 =====
    const summary = "✅ 已导入 " + applied.length + " 项设置";
    let detailHtml = "<p style='margin:0 0 8px;'>" + esc(summary) + "</p>";

    if (applied.length > 0) {
      detailHtml +=
        "<p style='margin:0 0 6px;color:var(--text-soft);font-size:13px;'>已应用：</p>" +
        "<ul style='margin:0 0 0 18px;padding:0;font-size:13px;color:var(--text-soft);line-height:1.7;'>" +
        applied.map((n) => "<li>" + esc(n) + "</li>").join("") +
        "</ul>";
    }

    if (skipped.length > 0) {
      detailHtml +=
        "<p style='margin:8px 0 6px;color:var(--text-soft);font-size:13px;'>文件中未包含：</p>" +
        "<ul style='margin:0 0 0 18px;padding:0;font-size:13px;color:var(--text-soft);line-height:1.7;'>" +
        skipped.map((n) => "<li>" + esc(n) + "</li>").join("") +
        "</ul>";
    }

    openModal(
      "导入设置结果",
      detailHtml +
        '<div class="row" style="justify-content:center;margin-top:16px;">' +
        '<button class="primary" onclick="closeModal()">知道了</button>' +
        "</div>",
    );

    // ★ 阻止 _wireModal 里的 closeModal() 关掉刚打开的弹窗
    return false;
  } catch (err) {
    console.error("应用导入设置失败：", err);
    toast("应用导入设置失败：" + (err && err.message ? err.message : err));
    return false;
  }
}
