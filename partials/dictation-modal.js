/* 默写弹窗的 HTML 字符串 */
window.__PARTIAL_dictModal = `
<div class="modal-box settings-box dict-box">
  <div class="settings-head">
    <h2>默写</h2>
    <button class="modal-close" onclick="closeDict()" title="关闭">✕</button>
  </div>

  <div class="card" id="playingCard">
    <div id="currentWord" class="big">准备默写</div>
    <div id="progressText">进度: 0 / 0</div>
    <div class="progressbar">
      <div id="progressFill"></div>
    </div>
    <div id="timerText">本次用时: 0秒</div>

    <div class="nav-group">
      <button class="nav-btn" id="prevBtn" onclick="prevWord()" disabled>
        <span class="nav-icon">⏮</span>
        <span class="nav-label">上一个</span>
      </button>
      <button class="nav-btn nav-play" id="replayBtn" onclick="replayWord()" disabled>
        <span class="nav-icon">🔊</span>
        <span class="nav-label">重播</span>
      </button>
      <button class="nav-btn" id="nextBtn" onclick="nextWord()" disabled>
        <span class="nav-label">下一个</span>
        <span class="nav-icon">⏭</span>
      </button>
    </div>

    <div class="row">
      <button class="primary" id="dictCtrlBtn" onclick="onDictCtrl()">🚀 开始默写</button>
      <button id="pauseBtn" onclick="pauseResume()" disabled>⏸ 暂停</button>
    </div>
    <div id="dictLangHint" class="dict-lang-hint hidden"></div>
  </div>

  <div class="card hidden" id="reviewCard">
    <h2>默写完成，请标记错误的单词/词语</h2>
    <div id="reviewList"></div>
    <div class="row">
      <button class="ok" onclick="completeDictation()">✅ 标记完成，出分数</button>
    </div>
  </div>
</div>
`;