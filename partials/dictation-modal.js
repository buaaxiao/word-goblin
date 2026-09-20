/* ===================================================================
 * partials/dictation-modal.js — 默写弹窗
 *   HTML 常量 + openDict / closeDict
 *
 * 依赖：
 *   - main.js     ：openModalEl / closeModalEl
 *   - dictation.js：finishDictation（closeDict 时调）
 * =================================================================== */

const DICTATION_MODAL_HTML = `
<div class="modal-box dict-box">
  <div class="modal-head">
    <h2>默写</h2>
    <button type="button" class="modal-close" onclick="closeDict()" title="关闭">✕</button>
  </div>

  <!-- 大字 -->
  <div class="big" id="currentWord">准备默写</div>
  <!-- 进度 -->
  <div class="progressbar"><div id="progressFill"></div></div>
  <p id="progressText">进度: 0 / 0</p>
  <p id="timerText">本次用时: 0秒</p>

  <!-- 导航 -->
  <div class="nav-group" id="dictNavGroup">
    <button class="nav-btn" id="prevBtn" onclick="prevWord()">
      <span class="nav-icon">⏮</span><span class="nav-label">上一个</span>
    </button>
    <button class="nav-btn nav-play" id="replayBtn" onclick="replayWord()">
      <span class="nav-icon">🔁</span><span class="nav-label">重播</span>
    </button>
    <button class="nav-btn" id="nextBtn" onclick="nextWord()">
      <span class="nav-icon">⏭</span><span class="nav-label">下一个</span>
    </button>
  </div>

  <!-- 主控 -->
  <div class="row" id="dictMainCtrl" style="justify-content:center;gap:10px;">
    <button class="primary danger" id="dictCtrlBtn" onclick="onDictCtrl()">🚀 开始默写</button>
    <button id="pauseBtn" onclick="pauseResume()">⏸ 暂停</button>
  </div>

  <!-- 复习卡 -->
  <div class="hidden" id="reviewCard">
    <div class="hint-row review-actions">
      <button class="primary" onclick="completeDictation()">✅ 标记完成，出分数</button>
    </div>
    <div id="reviewList"></div>
  </div>
  <div class="dict-meta dict-meta-foot" id="dictMeta"></div>
  <div id="dictLangHint" class="dict-lang-hint hidden"></div>
</div>
`;

/** 打开默写弹窗 */
function openDict() {
  const m = document.getElementById("dictModal");
  if (!m) {
    console.error("#dictModal 不存在");
    return;
  }

  // ★ 惰性填充 HTML
  if (!m.innerHTML.trim()) {
    m.innerHTML = DICTATION_MODAL_HTML;
  }

  // ★ 刷新设置摘要
  if (typeof renderDictMeta === "function") renderDictMeta();

  // ★ 用 openModalEl 显示
  openModalEl(m);
}

/** 关闭默写弹窗 */
function closeDict() {
  const m = document.getElementById("dictModal");
  if (!m) return;

  if (dict.running) {
    // 默写中 → 弹确认框
    try {
      speechSynthesis.pause();
    } catch (e) {}

    openConfirmModal({
      title: "停止默写",
      body: "默写仍在进行中，确定要停止吗？<br>停止后将进入「默写完成」，可以逐个标记错误。",
      okTitle: "停止",
      onOk: function () {
        try {
          speechSynthesis.resume();
        } catch (e) {}
        finishDictation();
      },
      onCancel: function () {
        try {
          speechSynthesis.resume();
        } catch (e) {}
      },
    });
    return;
  }

  // 未在播报（idle / review）→ 直接关闭
  closeModalEl(m);
}
