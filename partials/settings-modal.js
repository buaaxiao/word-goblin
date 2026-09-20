/* ===================================================================
 * partials/settings-modal.js — 设置弹窗
 *   HTML 常量 + openSettings / closeSettings / switchSettingsTab
 *
 * 依赖：
 *   - main.js    ：openModalEl / closeModalEl
 *   - core.js    ：syncThemeModeRadios / getCurrentThemeMode /
 *                  loadDictationSettings / loadLangSelSetting
 * =================================================================== */

const SETTINGS_MODAL_HTML = `
<div class="modal-box settings-box">
  <div class="settings-head">
    <div class="settings-tabs">
      <button type="button" class="settings-tab active" id="tabSystem" onclick="switchSettingsTab('system')">⚙️ 系统设置</button>
      <button type="button" class="settings-tab" id="tabDictation" onclick="switchSettingsTab('dictation')">📝 默写设置</button>
    </div>
    <button type="button" class="modal-close" onclick="closeSettings()" title="关闭">✕</button>
  </div>

  <!-- Tab 内容：系统设置 -->
  <div class="settings-pane" id="paneSystem">
    <div class="set-group">
      <div class="row">
        <label>主题颜色模式</label>
        <div class="mode-options">
          <label><input type="radio" name="themeMode" value="light" onchange="setThemeMode('light')">☀️ 浅色</label>
          <label><input type="radio" name="themeMode" value="dark" onchange="setThemeMode('dark')">🌙 深色</label>
        </div>
      </div>
      <div class="row">
        <label>设置备份</label>
        <div class="hint-row">
          <button onclick="exportSettings()">📤 导出设置</button>
          <button onclick="importSettings()">📥 导入设置</button>
        </div>
        <p class="hint-text">导出系统设置、默写设置等配置信息。清缓存后可从该导出文件恢复。</p>
      </div>
    </div>
  </div>

  <!-- Tab 内容：默写设置 -->
  <div class="settings-pane hidden" id="paneDictation">
    <div class="set-group">
      <div class="row">
        <label>播报间隔</label>
        <input type="number" id="intervalSec" value="3" min="0" max="120" onchange="saveDictationSettings()"><label>秒</label>
      </div>
      <div class="row">
        <label>每词遍数</label>
        <input type="number" id="repeatCount" value="3" min="1" max="10" onchange="saveDictationSettings()">
      </div>
      <div class="row">
        <label>每遍间隔</label>
        <input type="number" id="repeatIntervalSec" value="2" min="0" max="60" onchange="saveDictationSettings()"><label>秒</label>
      </div>
      <div class="row">
        <label>报词方式</label>
        <div id="dictLangOptions"></div>
      </div>
      <div class="row">
        <label>默写范围</label>
        <div id="dictModeOptions"></div>
      </div>
      <div class="row">
        <label>播报顺序</label>
        <div id="playOrderOptions"></div>
      </div>
      <div class="hint-row">
        <button onclick="testSpeech()">🔊 测试发音</button>
        <span>没声音？先点“测试发音”，并检查系统 TTS 中文语音与媒体音量</span>
      </div>
      <p class="hint-text">提示：点“开始默写”后按设置的顺序播报；播报结束后逐个标记错误，最后“出分数”。</p>
    </div>
  </div>
</div>
`;

/** Tab 切换：system / dictation */
function switchSettingsTab(tab) {
  const tabSystem = document.getElementById("tabSystem");
  const tabDictation = document.getElementById("tabDictation");
  const paneSystem = document.getElementById("paneSystem");
  const paneDictation = document.getElementById("paneDictation");
  if (!tabSystem || !tabDictation || !paneSystem || !paneDictation) return;

  const isSystem = tab === "system";
  tabSystem.classList.toggle("active", isSystem);
  tabDictation.classList.toggle("active", !isSystem);
  paneSystem.classList.toggle("hidden", !isSystem);
  paneDictation.classList.toggle("hidden", isSystem);
}

/** 打开设置弹窗 */
function openSettings() {
  const m = document.getElementById("settingsModal");
  if (!m) {
    console.error("#settingsModal 不存在");
    return;
  }
  // 1. 惰性填充 HTML
  if (!m.innerHTML.trim()) {
    m.innerHTML = SETTINGS_MODAL_HTML;
  }

  // 2. 动态渲染三个 custom-select（在 HTML 填好后）
  const orderBox = m.querySelector("#playOrderOptions");
  if (orderBox) {
    const cur = getDictationSettings().playOrder || PLAY_ORDER.SEQ;
    orderBox.innerHTML = _buildCustomSelect(
      "playOrderSelect",
      cur,
      PLAY_ORDER_LABELS[cur] || PLAY_ORDER_DEFAULT,
      PLAY_ORDER_DEF,
      "pickPlayOrder",
    );
  }

  const modeBox = m.querySelector("#dictModeOptions");
  if (modeBox) {
    const cur = getDictationSettings().mode || DICT_MODE.ALL;
    modeBox.innerHTML = _buildCustomSelect(
      "dictModeSelect",
      cur,
      DICT_MODE_LABELS[cur] || DICT_MODE_DEFAULT,
      DICT_MODE_DEF,
      "pickDictMode",
    );
  }

  const langBox = m.querySelector("#dictLangOptions");
  if (langBox) {
    const cur = normalizeDictLang(getDefaultDictLang());
    langBox.innerHTML = _buildCustomSelect(
      "dictLangSelect",
      cur,
      DICT_LANG_LABELS[cur] || DICT_LANG_DEFAULT,
      DICT_LANG_DEF,
      "pickDictLang",
    );
  }

  // 同步当前值到 UI
  if (typeof syncThemeModeRadios === "function") {
    syncThemeModeRadios(config.theme);
  }
  if (typeof loadDictationSettings === "function") {
    loadDictationSettings();
  }
  if (typeof loadLangSelSetting === "function") {
    loadLangSelSetting();
  }

  // 默认显示"系统设置"
  switchSettingsTab("system");

  // ★ 用 main.js 的 openModalEl 显示
  openModalEl(m);
}

/** 关闭设置弹窗 */
function closeSettings() {
  closeModalEl(document.getElementById("settingsModal"));
}

/**
 * 生成 custom-select HTML
 */
function _buildCustomSelect(id, curValue, curLabel, defs, pickFnName) {
  const optionsHtml = defs
    .map(
      (d) =>
        '<div class="custom-select-option' +
        (String(d.value) === String(curValue) ? " selected" : "") +
        '" data-value="' +
        d.value +
        '" onclick="' +
        pickFnName +
        "('" +
        d.value +
        "')\">" +
        d.label +
        "</div>",
    )
    .join("");

  return (
    '<div class="custom-select" id="' +
    id +
    '" data-value="' +
    curValue +
    '">' +
    '<button type="button" class="custom-select-btn" onclick="toggleCustomSelect(\'' +
    id +
    "')\">" +
    '<span class="custom-select-label">' +
    curLabel +
    "</span>" +
    '<span class="custom-select-arrow">▾</span>' +
    "</button>" +
    '<div class="custom-select-panel hidden">' +
    optionsHtml +
    "</div>" +
    "</div>"
  );
}

function pickPlayOrder(value) {
  setCustomSelectValue("playOrderSelect", value);
  _closeAllCustomSelects();
  const s = getDictationSettings();
  s.playOrder = Number(value);
  setConfig(KEY_DICTATION, s);
}

function pickDictMode(value) {
  setCustomSelectValue("dictModeSelect", value);
  _closeAllCustomSelects();
  const s = getDictationSettings();
  s.mode = Number(value);
  setConfig(KEY_DICTATION, s);
}

function pickDictLang(value) {
  setCustomSelectValue("dictLangSelect", value);
  _closeAllCustomSelects();
  setConfig(KEY_DICT_LANG, Number(value));
}
