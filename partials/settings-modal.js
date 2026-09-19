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
        <p class="hint-text">导出的 settings.json 包含：主题、报词方式、默写设置、列表折叠/模式。清缓存后可从该文件恢复。</p>
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
        <div class="mode-options">
          <label><input type="radio" name="dictLang" value="1" onchange="saveLangSelSetting()"> 汉语</label>
          <label><input type="radio" name="dictLang" value="0" onchange="saveLangSelSetting()"> English</label>
        </div>
      </div>
      <div class="row">
        <label>默写范围</label>
        <div class="mode-options">
          <label><input type="radio" name="dictMode" value="0" onchange="saveDictationSettings()"> 全部单词</label>
          <label><input type="radio" name="dictMode" value="1" onchange="saveDictationSettings()"> 仅错题</label>
          <label><input type="radio" name="dictMode" value="2" onchange="saveDictationSettings()"> 仅最后错误</label>
        </div>
      </div>
      <div class="row">
        <label>播报顺序</label>
        <div class="mode-options">
          <label><input type="radio" name="playOrder" value="0" onchange="saveDictationSettings()"> 顺序</label>
          <label><input type="radio" name="playOrder" value="1" onchange="saveDictationSettings()"> 随机</label>
          <label><input type="radio" name="playOrder" value="2" onchange="saveDictationSettings()"> 循环</label>
          <label><input type="radio" name="playOrder" value="3" onchange="saveDictationSettings()"> 单一</label>
        </div>
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

  // ★ 惰性填充 HTML（只有第一次真正填）
  if (!m.innerHTML.trim()) {
    m.innerHTML = SETTINGS_MODAL_HTML;
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
