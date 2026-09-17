/* ===================================================================
 * js/storage.js - 数据持久化与统计
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */
const LS_KEY = 'wordDictation.v1';
let data = { chapters: [], history: [] };
let currentChapter = 0;
const openWordDetails = new Set();

async function loadData() {
  let loadedFromLocal = false;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && Array.isArray(obj.chapters) && obj.chapters.length > 0) {
        data = obj;
        normalizeData();
        loadedFromLocal = true;
        setDataSourceHint('本地');
      }
    }
  } catch (e) {
    console.warn('本地数据读取失败', e);
  }

  if (!loadedFromLocal) {
    try {
      const res = await fetch('data.json?_=' + Date.now());
      if (res.ok) {
        const obj = await res.json();
        if (obj && Array.isArray(obj.chapters) && obj.chapters.length > 0) {
          data = obj;
          normalizeData();
          saveData();
          setDataSourceHint('共享');
        }
      }
    } catch (e) {
      console.warn('共享词库加载失败', e);
    }
  }

  normalizeData();
}

function setDataSourceHint(source) {
  const el = document.getElementById('dataSourceHint');
  if (!el) return;
  if (source === '本地') {
    el.textContent = '当前词库来自本地缓存。如需获取共享词库最新版本，可点「☁️ 从共享词库同步」。';
  } else if (source === '共享') {
    el.textContent = '当前词库来自共享 data.json，已缓存到本地。之后修改都保存在本地。';
  } else {
    el.textContent = '暂无词库数据，可添加章节或点「☁️ 从共享词库同步」。';
  }
}

function normalizeData() {
  if (!Array.isArray(data.chapters)) data.chapters = [];
  if (!Array.isArray(data.history)) data.history = [];
  for (const ch of data.chapters) {
    ch.selected = !!ch.selected;
    if (typeof ch.dictLang !== 'number') ch.dictLang = getDefaultDictLang(); // 旧数据无 dictLang 时按设置界面的默认报词方式
    ch.words = Array.isArray(ch.words) ? ch.words : [];
    for (const w of ch.words) {
      w.text = w.text || ''; w.meaning = w.meaning || '';
      w.wrongCount = w.wrongCount || 0; w.correctCount = w.correctCount || 0;
      w.lastErrorDate = w.lastErrorDate || ''; w.lastCorrectDate = w.lastCorrectDate || '';
      w.scoreCount = w.scoreCount || 0; w.scoreSum = w.scoreSum || 0;
    }
  }
}
function saveData() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {}
}

function updateStats() {
  let totalWords = 0, totalWrong = 0, selectedCount = 0;
  data.chapters.forEach(ch => {
    totalWords += ch.words.length;
    if (ch.selected) selectedCount++;
    ch.words.forEach(w => {
      totalWrong += (w.wrongCount || 0);
    });
  });
  $('statChapters').textContent = data.chapters.length;
  $('statWords').textContent = totalWords;
  $('statWrong').textContent = totalWrong;
  $('statSelected').textContent = selectedCount;
}

function jumpToWrongWords() {
  for (let i = 0; i < data.chapters.length; i++) {
    const hasWrong = data.chapters[i].words.some(w => (w.wrongCount || 0) > 0);
    if (hasWrong) {
      currentChapter = i;
      data.chapters[i].selected = true; // 合集视图：跳转时勾选目标章节
      saveData();
      collapseState.chapter = false;
      collapseState.word = false;
      saveCollapseState();
      applyCollapseState();
      renderChapterList();
      renderWords();
      setTimeout(() => {
        const wordEl = document.querySelector('.word-item');
        if (wordEl) wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }
  }
  toast('暂无错词');
}
