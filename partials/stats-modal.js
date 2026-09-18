/* 统计弹窗的 HTML 字符串 */
window.__PARTIAL_statsModal = `
<div class="modal-box settings-box">
  <div class="settings-head">
    <h2>统计</h2>
    <button class="modal-close" onclick="closeStats()" title="关闭">✕</button>
  </div>

  <div class="set-group">
    <h3>默写趋势<span class="collapse-badge" id="chartBadge" style="margin-left:auto;">最近 10 次</span></h3>
    <div id="chartContainer"></div>
  </div>

  <div class="set-group">
    <h3>默写历史<span class="collapse-badge" id="historyCountBadge" style="margin-left:auto;">0 次</span></h3>
    <div id="historyList" class="history-list"></div>
    <div class="row" id="historyActions" style="margin-top:10px;display:none;">
      <button class="danger" onclick="clearHistory()">🗑 清空历史</button>
    </div>
  </div>
</div>
`;