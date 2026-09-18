/* 设置弹窗的 HTML 字符串；由 main.js 注入到 #settingsModal */
window.__PARTIAL_settingsModal = `
<div class="modal-box settings-box">
  <div class="settings-head">
    <h2>设置</h2>
    <button class="modal-close" onclick="closeSettings()" title="关闭">✕</button>
  </div>

  <div class="set-group">
    <h3>系统设置</h3>
    <div class="row">
      <label>主题颜色模式</label>
      <div class="mode-options">
        <label><input type="radio" name="themeMode" value="light" onchange="setThemeMode('light')">☀️ 浅色</label>
        <label><input type="radio" name="themeMode" value="dark" onchange="setThemeMode('dark')">🌙 深色</label>
      </div>
    </div>
  </div>

  <div class="set-group">
    <h3>默写设置</h3>
    <div class="row">
      <label>播报间隔</label>
      <input type="number" id="intervalSec" value="3" min="0" max="120"><label>秒</label>
    </div>
    <div class="row">
      <label>每词遍数</label>
      <input type="number" id="repeatCount" value="3" min="1" max="10">
    </div>
    <div class="row">
      <label>每遍间隔</label>
      <input type="number" id="repeatIntervalSec" value="2" min="0" max="60"><label>秒</label>
    </div>
    <div class="row">
      <label>报词方式</label>
      <select id="langSel" onchange="saveLangSelSetting()">
        <option value="0">English</option>
        <option value="1" selected>汉语</option>
      </select>
    </div>
    <div class="row">
      <label>默写范围</label>
      <select id="modeSel">
        <option value="0">全部单词</option>
        <option value="1">仅播报错题</option>
        <option value="2">仅报最后默写错误的单词</option>
      </select>
    </div>
    <div class="hint-row">
      <button onclick="testSpeech()">🔊 测试发音</button>
      <span>没声音？先点“测试发音”，并检查系统 TTS 中文语音与媒体音量</span>
    </div>
    <p class="hint-text">提示：点“开始默写”后随机排序依次播报；播报结束后逐个标记错误，最后“出分数”。</p>
  </div>
</div>
`;