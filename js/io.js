/* ===================================================================
 * js/io.js - 导入 / 导出 / 云端同步
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */

function importData() { $('fileInput').click(); }
$('fileInput').addEventListener('change', function (e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || !Array.isArray(obj.chapters)) { toast('格式不正确：缺少 chapters'); return; }
      data = obj;
      currentChapter = 0;
      normalizeData();
      saveData();
      renderChapterList();
      renderWords();
      renderHistory();
      renderChart();
      toast('导入成功');
    } catch (err) { toast('解析失败：' + err.message); }
  };
  reader.readAsText(f, 'utf-8');
  e.target.value = '';
});
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function syncFromCloud() {
  if (!confirm('将从 data.json 合并词库：\n· 本地独有的章节和单词会保留\n· 云端独有的章节会追加\n· 同名章节按单词去重合并\n\n确定继续？')) return;

  try {
    const res = await fetch('data.json?_=' + Date.now());
    if (!res.ok) { toast('加载失败：HTTP ' + res.status); return; }
    const cloud = await res.json();
    if (!cloud || !Array.isArray(cloud.chapters)) { toast('data.json 格式不正确'); return; }

    try {
      localStorage.setItem(LS_KEY + '.backup', JSON.stringify(data));
    } catch (e) {}

    const localMap = new Map();
    data.chapters.forEach((ch, i) => localMap.set(ch.name, i));

    cloud.chapters.forEach(cCloudCh => {
      const idx = localMap.get(cCloudCh.name);
      if (idx === undefined) {
        data.chapters.push(cCloudCh);
      } else {
        const localCh = data.chapters[idx];
        if (typeof cCloudCh.dictLang === 'number') localCh.dictLang = cCloudCh.dictLang; // 报词方式以 data.json 为准
        const localTexts = new Set(localCh.words.map(w => w.text));
        cCloudCh.words.forEach(w => {
          if (!localTexts.has(w.text)) {
            localCh.words.push(w);
          }
        });
      }
    });

    saveData();
    renderChapterList();
    renderWords();
    setDataSourceHint('本地');
    toast('已合并共享词库，本地数据已保留');
  } catch (e) {
    toast('同步失败：' + e.message);
  }
}
