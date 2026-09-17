/* ===================================================================
 * js/main.js - 应用初始化
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */

(async function init() {
  loadTheme();
  loadCollapseState();
  loadListMode();
  loadDedupe();
  loadLangSelSetting();
  applyModesUI();
  await loadData();
  if (data.chapters.length && currentChapter >= data.chapters.length) currentChapter = 0;
  renderChapterList();
  renderWords();
  renderHistory();
  renderChart();
  applyCollapseState();
  showPhase('idle');
  loadVoices();
  if (!data.chapters.length) {
    setDataSourceHint('');
  }
})();
