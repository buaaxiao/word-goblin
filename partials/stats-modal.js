/* ===================================================================
 * partials/stats-modal.js — 统计弹窗
 *   HTML 常量 + openStats / closeStats
 *
 * 依赖：
 *   - main.js     ：openModalEl / closeModalEl
 *   - reports.js  ：renderChart / renderHistory
 * =================================================================== */

const STATS_MODAL_HTML = `
<div class="modal-box">
  <div class="modal-head">
    <h2>统计</h2>
    <button type="button" class="modal-close" onclick="closeStats()" title="关闭">✕</button>
  </div>

  <div class="set-group">
    <h3>默写趋势 <span id="chartBadge" class="collapse-badge">0 次</span></h3>
    <div id="chartContainer">
      <div class="chart-empty">暂无记录</div>
    </div>
  </div>

  <div class="set-group">
    <h3>历史记录 <span id="historyCountBadge" class="collapse-badge">0 次</span></h3>
    <div id="historyActions" style="display:none; justify-content:flex-end; margin-bottom:8px;">
      <button onclick="confirmClearHistory()">🗑 清空历史</button>
    </div>
    <div class="history-list" id="historyList"></div>
  </div>
</div>
`;

/** 打开统计弹窗 */
function openStats() {
  const m = document.getElementById("statsModal");
  if (!m) {
    console.error("#statsModal 不存在");
    return;
  }

  // ★ 惰性填充 HTML
  if (!m.innerHTML.trim()) {
    m.innerHTML = STATS_MODAL_HTML;
  }

  // ★ 用 openModalEl 显示，并在打开后渲染图表 / 历史
  openModalEl(m, function () {
    if (typeof renderChart === "function") {
      try {
        renderChart();
      } catch (e) {
        console.error("renderChart 失败：", e);
      }
    }
    if (typeof renderHistory === "function") {
      try {
        renderHistory();
      } catch (e) {
        console.error("renderHistory 失败：", e);
      }
    }
  });
}

/** 关闭统计弹窗 */
function closeStats() {
  closeModalEl(document.getElementById("statsModal"));
}
