/* ===================================================================
 * js/reports.js - 默写趋势图与历史记录
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */

/* ===================================================================
 * 顶部统计卡：章节数 / 单词数 / 错词数 / 已选章节
 * =================================================================== */
function updateStats() {
  const totalChapters = (data.chapters || []).length;
  const totalWords = (data.chapters || []).reduce(
    (n, ch) => n + (ch.words ? ch.words.length : 0),
    0,
  );
  const totalWrong = (data.chapters || []).reduce(
    (n, ch) =>
      n +
      (ch.words ? ch.words.filter((w) => (w.wrongCount || 0) > 0).length : 0),
    0,
  );
  const totalSelected = (data.chapters || []).filter((c) => c.selected).length;

  const el1 = document.getElementById("statChapters");
  const el2 = document.getElementById("statWords");
  const el3 = document.getElementById("statWrong");
  const el4 = document.getElementById("statSelected");

  if (el1) el1.textContent = totalChapters;
  if (el2) el2.textContent = totalWords;
  if (el3) el3.textContent = totalWrong;
  if (el4) el4.textContent = totalSelected;
}

function renderChart() {
  const container = $("chartContainer");
  if (!container) return;
  const badge = $("chartBadge");
  const history = data.history || [];

  if (history.length < 2) {
    if (badge) badge.textContent = history.length + " 次";
    container.innerHTML =
      '<div class="chart-empty">至少需要 2 次默写记录才能显示趋势</div>';
    return;
  }

  const recent = history.slice(-10);
  if (badge) badge.textContent = "最近 " + recent.length + " 次";

  const W = 620,
    H = 200;
  const padL = 30,
    padR = 15,
    padT = 20,
    padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = recent.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const points = recent.map((h, i) => {
    const x = padL + i * stepX;
    const score = Math.max(0, Math.min(100, h.score || 0));
    const y = padT + innerH * (1 - score / 100);
    return { x, y, score, item: h };
  });

  let gridLines = "";
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = padT + innerH * (1 - v / 100);
    gridLines +=
      '<line class="chart-grid" x1="' +
      padL +
      '" y1="' +
      y +
      '" x2="' +
      (W - padR) +
      '" y2="' +
      y +
      '"/>';
    gridLines +=
      '<text class="chart-axis-text" x="' +
      (padL - 6) +
      '" y="' +
      (y + 3) +
      '" text-anchor="end">' +
      v +
      "</text>";
  });

  const linePath = points
    .map(
      (p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1),
    )
    .join(" ");
  const areaPath =
    linePath +
    " L" +
    points[n - 1].x.toFixed(1) +
    "," +
    (padT + innerH) +
    " L" +
    points[0].x.toFixed(1) +
    "," +
    (padT + innerH) +
    " Z";

  let xLabels = "";
  const labelStep = Math.max(1, Math.ceil(n / 6));
  points.forEach((p, i) => {
    if (i % labelStep === 0 || i === n - 1) {
      const label = (p.item.date || "").slice(5, 10) || i + 1 + "";
      xLabels +=
        '<text class="chart-axis-text" x="' +
        p.x.toFixed(1) +
        '" y="' +
        (H - 8) +
        '" text-anchor="middle">' +
        esc(label) +
        "</text>";
    }
  });

  const dots = points
    .map(
      (p, i) =>
        '<circle class="chart-dot" cx="' +
        p.x.toFixed(1) +
        '" cy="' +
        p.y.toFixed(1) +
        '" r="4">' +
        "<title>" +
        esc(p.item.date || "") +
        " · " +
        p.score.toFixed(1) +
        " 分 · " +
        (p.item.total || 0) +
        " 词</title>" +
        "</circle>",
    )
    .join("");

  const scores = recent.map((h) => h.score || 0);
  const avgScore = (scores.reduce((a, b) => a + b, 0) / n).toFixed(1);
  const maxScore = Math.max.apply(null, scores).toFixed(1);
  const minScore = Math.min.apply(null, scores).toFixed(1);
  const totalWords = recent.reduce((a, h) => a + (h.total || 0), 0);
  const totalWrong = recent.reduce((a, h) => a + (h.wrongCount || 0), 0);

  const svg =
    '<div class="chart-wrap">' +
    '<svg class="chart-svg" viewBox="0 0 ' +
    W +
    " " +
    H +
    '" preserveAspectRatio="none">' +
    "<defs>" +
    '<linearGradient id="chartGradient" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#5b8def"/>' +
    '<stop offset="100%" stop-color="#4a7cff"/>' +
    "</linearGradient>" +
    '<linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#4a7cff" stop-opacity="0.3"/>' +
    '<stop offset="100%" stop-color="#4a7cff" stop-opacity="0"/>' +
    "</linearGradient>" +
    "</defs>" +
    gridLines +
    '<path class="chart-area" d="' +
    areaPath +
    '"/>' +
    '<path class="chart-line" d="' +
    linePath +
    '"/>' +
    dots +
    xLabels +
    "</svg>" +
    '<div class="chart-legend">' +
    '<span class="legend-item"><span class="dot"></span> 每次得分</span>' +
    '<span class="legend-item">📅 日期</span>' +
    "</div>" +
    '<div class="chart-stats">' +
    '<span class="cs-item">平均分 <b>' +
    avgScore +
    "</b></span>" +
    '<span class="cs-item">最高 <b>' +
    maxScore +
    "</b></span>" +
    '<span class="cs-item">最低 <b>' +
    minScore +
    "</b></span>" +
    '<span class="cs-item">总词数 <b>' +
    totalWords +
    "</b></span>" +
    '<span class="cs-item">总错词 <b>' +
    totalWords +
    "</b></span>" +
    "</div>" +
    "</div>";
  container.innerHTML = svg;
}

function renderHistory() {
  const el = $("historyList");
  if (!el) return;
  const badge = $("historyCountBadge");
  const actions = $("historyActions");
  const history = data.history || [];
  if (badge) badge.textContent = history.length + " 次";
  if (actions) actions.style.display = history.length ? "flex" : "none";

  if (!history.length) {
    el.innerHTML = '<div class="history-empty">暂无默写记录</div>';
    return;
  }
  const list = history.slice().reverse().slice(0, 30);
  el.innerHTML = list
    .map((h, i) => {
      const score = h.score || 0;
      let color;
      if (score >= 90) color = "linear-gradient(135deg, #2dbf7f, #22a06b)";
      else if (score >= 70) color = "linear-gradient(135deg, #5b8def, #4a7cff)";
      else if (score >= 50) color = "linear-gradient(135deg, #fbbf24, #f59e0b)";
      else color = "linear-gradient(135deg, #f56b6b, #f05252)";
      return (
        '<div class="history-item">' +
        '<div class="history-score" style="background:' +
        color +
        '">' +
        Math.round(score) +
        "</div>" +
        '<div class="history-info">' +
        '<div class="history-title">' +
        esc(h.chapters || "—") +
        "</div>" +
        '<div class="history-meta">' +
        "<span>📅 " +
        esc(h.date || "") +
        "</span>" +
        "<span>📝 " +
        (h.total || 0) +
        " 词</span>" +
        '<span style="color:var(--danger);">❌ ' +
        (h.wrongCount || 0) +
        "</span>" +
        "</div>" +
        "</div>" +
        "</div>"
      );
    })
    .join("");
}

/* ===================================================================
 * 清空历史
 * =================================================================== */

// 清空历史：弹出确认对话框
function confirmClearHistory() {
  confirmDialog(
    "清空历史",
    "确定要清空全部默写历史记录吗？<br>" + "此操作不可撤销。",
    function () {
      doClearHistory();
    },
  );
}

// 实际清空历史
async function doClearHistory() {
  try {
    data.history = [];

    if (typeof dbClearHistory === "function") {
      await dbClearHistory();
    } else if (typeof saveData === "function") {
      // 兜底
      await saveData();
    }

    renderHistory();
    renderChart();
    toast("历史已清空");
  } catch (e) {
    console.error("清空历史失败：", e);
    toast("清空历史失败：" + (e && e.message ? e.message : e));
  }
}
