/* ===================================================================
 * js/words.js - 单词列表 / 排序 / 增删改
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 *
 * 单词行结构：单层 grid（8 槽），与 .word-table-header 共享同一套列模板
 *   编辑模式：手柄 | 单词 | 对 | 最后对 | 错 | 最后错 | 均分 | 操作
 *   查看模式：单词 | 对 | 最后对 | 错 | 最后错 | 均分              (6 槽)
 *   多章节：  单词 | 对 | 最后对 | 错 | 最后错 | 均分 | 操作       (7 槽)
 * =================================================================== */
let wordDragSrcIndex = null;
let wordDragOverIndex = null;

// ===== 单词去重 =====
const DEDUPE_KEY = 'wordDictation.dedupe.v1';
let dedupeWords = false;
function loadDedupe() {
  try { dedupeWords = localStorage.getItem(DEDUPE_KEY) === '1'; } catch (e) { }
  applyDedupeUI();
}
function applyDedupeUI() {
  const b = $('dedupeBtn');
  if (!b) return;
  b.classList.toggle('on', dedupeWords);
  b.title = dedupeWords ? '已开启：相同单词只显示第一个' : '开启去重：相同单词只显示第一个';
}
function toggleDedupe() {
  dedupeWords = !dedupeWords;
  try { localStorage.setItem(DEDUPE_KEY, dedupeWords ? '1' : '0'); } catch (e) { }
  openWordDetails.clear();
  applyDedupeUI();
  collapseState.word = false;
  saveCollapseState();
  applyCollapseState();
  renderWords();
}

// 合并「所有选中章节」的单词，按章节顺序拼接；去重开启时相同 text 只保留第一个
function getMergedItems() {
  const items = [];
  for (let ci = 0; ci < data.chapters.length; ci++) {
    const ch = data.chapters[ci];
    if (!ch.selected) continue;
    for (let wi = 0; wi < ch.words.length; wi++) items.push({ ci, wi, w: ch.words[wi] });
  }
  const raw = items.length;
  let shown = items;
  if (dedupeWords) {
    const seen = new Set();
    shown = [];
    for (const it of items) {
      const t = (it.w.text || '').trim();
      if (seen.has(t)) continue;
      seen.add(t);
      shown.push(it);
    }
  }
  shown._raw = raw;
  return shown;
}

// ===== 单词行 HTML：单层 grid（8 槽或 6 槽） =====
// 槽位（编辑/多章节）：手柄 | 单词 | 对 | 最后对 | 错 | 最后错 | 均分 | 操作
// 槽位（查看模式）：    单词 | 对 | 最后对 | 错 | 最后错 | 均分
function buildWordRowHtml(w, key, opts) {
  const { viewMode, noHandle, wordSearchQuery } = opts;
  const wordTip = w.meaning ? w.text + '（' + w.meaning + '）' : w.text;

  // 单词列
  const wordHtml =
    '<span class="word-cell">' +
    '<span class="wtext" title="' + esc(wordTip) + '" onclick="toggleWordDetail(' + key + ')">' +
    highlightText(w.text, wordSearchQuery) +
    '</span>' +
    (w.meaning
      ? '<span class="wmeaning" title="' + esc(w.meaning) + '">' +
      highlightText(w.meaning, wordSearchQuery) +
      '</span>'
      : '') +
    '</span>';

  // 5 个统计列
  const statsHtml =
    '<span class="wstat-num" title="答对 ' + (w.correctCount || 0) + ' 次">✅ ' + (w.correctCount || 0) + '</span>' +
    '<span class="wstat-date" title="最后答对 ' + (w.lastCorrectDate || '—') + '">' + (w.lastCorrectDate || '—') + '</span>' +
    '<span class="wstat-num" title="答错 ' + (w.wrongCount || 0) + ' 次">❌ ' + (w.wrongCount || 0) + '</span>' +
    '<span class="wstat-date" title="最后答错 ' + (w.lastErrorDate || '—') + '">' + (w.lastErrorDate || '—') + '</span>' +
    '<span class="wstat-score" title="均分 ' + avg(w) + '">⭐ ' + avg(w) + '</span>';

  // 操作列
  const actionsHtml =
    '<span class="wstat-actions">' +
    '<button class="icon-btn" onclick="editWord(' + key + ')" title="编辑">✎</button>' +
    '<button class="icon-btn" onclick="deleteWord(' + key + ')" title="删除">🗑</button>' +
    '</span>';

  // 查看模式：6 槽（单词 + 5 统计）
  if (viewMode) return wordHtml + statsHtml;

  // 多章节 / 去重：7 槽（单词 + 5 统计 + 操作，无手柄）
  if (noHandle) return wordHtml + statsHtml + actionsHtml;

  // 编辑模式（单章节，有手柄）：8 槽
  return '<span class="drag-handle" title="拖动排序">≡</span>' +
    wordHtml + statsHtml + actionsHtml;
}
function renderWords() {
  // ★ 最优先：同步折叠状态，避免列表内容闪现
  const wBody = $('wordBody');
  if (wBody) {
    wBody.classList.toggle('collapsed', collapseState.word && !wordSearchQuery);
  }

  const el = $('wordList');
  el.innerHTML = '';
  const titleEl = $('wordChapterTitle');
  const badge = $('wordCountBadge');

  const selectedIdx = [];
  data.chapters.forEach((c, ci) => { if (c.selected) selectedIdx.push(ci); });
  if (!selectedIdx.length) {
    if (badge) badge.textContent = '0 词';
    if (titleEl) titleEl.textContent = '未选中章节';
    el.innerHTML = '<div class="empty-state">未选中任何章节，请先勾选要默写的章节</div>';
    updateStats();
    return;
  }

  const multi = selectedIdx.length > 1;
  if (!multi && currentChapter !== selectedIdx[0]) currentChapter = selectedIdx[0];
  const noHandle = multi || dedupeWords;

  // 把 multi-ch 也在这里设置（与 collapsed 同处，保持一次 DOM 操作）
  if (wBody) {
    wBody.classList.toggle('multi-ch', noHandle);
  }

  const items = getMergedItems();
  const rawCount = items._raw;
  if (titleEl) {
    titleEl.textContent = multi
      ? '选中' + selectedIdx.length + '章'
      : '「' + data.chapters[currentChapter].name + '」的单词';
  }

  let filtered = items.map((it, i) => ({ it, i }));
  if (wordSearchQuery) {
    const q = wordSearchQuery.toLowerCase();
    filtered = filtered.filter(x =>
      (x.it.w.text || '').toLowerCase().indexOf(q) >= 0 ||
      (x.it.w.meaning || '').toLowerCase().indexOf(q) >= 0
    );
  }

  if (badge) {
    if (wordSearchQuery) badge.textContent = '找到 ' + filtered.length + ' 个';
    else if (dedupeWords && rawCount > items.length) badge.textContent = '去重 ' + items.length + ' / ' + rawCount + ' 词';
    else badge.textContent = items.length + ' 词';
  }

  // // 折叠预览（编辑模式、未搜索）
  // if (wordMode !== 'view' && collapseState.word && !wordSearchQuery && items.length > 0) {
  //   const preview = document.createElement('div');
  //   preview.className = 'word-preview';
  //   const maxShow = 20;
  //   preview.innerHTML = items.slice(0, maxShow).map(it =>
  //     '<span class="wp-item">' + esc(it.w.text) + '</span>'
  //   ).join('') +
  //   (items.length > maxShow ? '<span class="wp-more">…还有 ' + (items.length - maxShow) + ' 个</span>' : '');
  //   el.appendChild(preview);
  //   updateStats();
  //   return;
  // }

  if (!items.length) {
    el.innerHTML = '<div class="empty-state">暂无单词，请先添加或勾选其他章节</div>';
    updateStats();
    return;
  }
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state searching">未找到匹配的单词</div>';
    updateStats();
    return;
  }

  filtered.forEach(({ it, i }) => {
    const key = i;
    const isOpen = openWordDetails.has(key);
    const w = it.w;
    const d = document.createElement('div');
    const viewMode = wordMode === 'view';
    d.className = 'word-item' + (viewMode ? ' view-mode' : '');
    d.setAttribute('draggable', 'false');
    d.dataset.index = i;

    const total = (w.wrongCount || 0) + (w.correctCount || 0);
    const okPct = total > 0 ? Math.round((w.correctCount || 0) / total * 100) : 0;
    const wrongPct = total > 0 ? Math.round((w.wrongCount || 0) / total * 100) : 0;

    const detailHtml =
      '<div class="word-detail' + (isOpen ? ' show' : '') + '" id="wd-' + key + '">' +
      '<div class="detail-row"><span class="detail-label">练习总次数</span><span class="detail-value">' + total + ' 次</span></div>' +
      '<div class="detail-row"><span class="detail-label">正确 / 错误</span><span class="detail-value"><span style="color:var(--ok);">' + (w.correctCount || 0) + '</span> / <span style="color:var(--danger);">' + (w.wrongCount || 0) + '</span></span></div>' +
      '<div class="detail-row"><span class="detail-label">得分记录</span><span class="detail-value">' + (w.scoreCount || 0) + ' 次，均分 ' + avg(w) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">正确率</span><span class="detail-value">' + okPct + '%</span></div>' +
      '<div class="detail-bar"><div class="bar-ok" style="width:' + okPct + '%"></div><div class="bar-wrong" style="width:' + wrongPct + '%"></div></div>' +
      '</div>';

    d.innerHTML = buildWordRowHtml(w, key, { viewMode, noHandle, wordSearchQuery }) + detailHtml;

    if (!viewMode && !noHandle) {
      d.addEventListener('dragstart', function (e) {
        wordDragSrcIndex = i;
        d.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', i);
        try { e.dataTransfer.setData('text/html', d.innerHTML); } catch (ex) { }
      });
      d.addEventListener('dragend', function () {
        d.classList.remove('dragging');
        clearWordDragOverStyles();
        wordDragSrcIndex = null;
        wordDragOverIndex = null;
      });
      d.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (wordDragSrcIndex === null || wordDragSrcIndex === i) return;
        clearWordDragOverStyles();
        const rect = d.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          d.classList.add('drag-over');
          wordDragOverIndex = { index: i, position: 'before' };
        } else {
          d.classList.add('drag-over-bottom');
          wordDragOverIndex = { index: i, position: 'after' };
        }
      });
      d.addEventListener('dragleave', function () {
        d.classList.remove('drag-over', 'drag-over-bottom');
      });
      d.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (wordDragSrcIndex === null || wordDragSrcIndex === i) return;
        if (!wordDragOverIndex) return;
        performWordReorder(wordDragSrcIndex, wordDragOverIndex.index, wordDragOverIndex.position);
      });
    }

    el.appendChild(d);
  });
  updateStats();
}

function toggleWordDetail(key) {
  if (openWordDetails.has(key)) openWordDetails.delete(key);
  else openWordDetails.add(key);
  const el = document.getElementById('wd-' + key);
  if (el) el.classList.toggle('show');
}

function clearWordDragOverStyles() {
  document.querySelectorAll('.word-item').forEach(item => {
    item.classList.remove('drag-over', 'drag-over-bottom');
  });
}

function performWordReorder(srcIndex, targetIndex, position) {
  if (srcIndex === targetIndex) return;
  if (currentChapter < 0 || currentChapter >= data.chapters.length) return;
  const words = data.chapters[currentChapter].words;
  if (srcIndex < 0 || srcIndex >= words.length) return;
  const item = words.splice(srcIndex, 1)[0];
  let insertIndex = targetIndex;
  if (srcIndex < targetIndex) insertIndex--;
  if (position === 'after') insertIndex++;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > words.length) insertIndex = words.length;
  words.splice(insertIndex, 0, item);
  openWordDetails.clear();

  saveData();
  renderWords();
  toast('单词排序已更新');
}

function addWord(text, meaning, ci) {
  ci = (ci === undefined || Number.isNaN(ci)) ? currentChapter : ci;
  if (ci < 0 || ci >= data.chapters.length) { toast('请先选择所属章节'); return; }
  text = (text || '').trim();
  if (!text) { toast('请输入单词/词语'); return; }
  if (text.length > 50) { toast('单词/词语不能超过 50 个字符'); return; }
  meaning = (meaning || '').trim();
  if (data.chapters[ci].words.some(w => w.text === text)) {
    toast('单词「' + text + '」已存在，只能通过编辑修改，不能重复添加');
    return;
  }
  data.chapters[ci].words.push({ text, meaning, wrongCount: 0, correctCount: 0, lastErrorDate: '', lastCorrectDate: '', scoreCount: 0, scoreSum: 0 });
  saveData(); renderWords(); renderChapterList();
}
function deleteWord(i) {
  const it = getMergedItems()[i];
  if (!it) return;
  if (!confirm('确定删除单词「' + it.w.text + '」吗？')) return;
  data.chapters[it.ci].words.splice(it.wi, 1);
  openWordDetails.clear();
  saveData(); renderWords(); renderChapterList();
}
function editWord(i) {
  const it = getMergedItems()[i];
  if (!it) return;
  const w = it.w;
  openModal('修改单词',
    '<label>单词/词语</label><input id="mText" class="input" value="' + esc(w.text) + '">' +
    '<label>中文意思（英语单词填，可留空）</label><input id="mMeaning" class="input" value="' + esc(w.meaning) + '">' +
    '<div class="row"><button onclick="closeModal()">取消</button>' +
    '<button class="primary" onclick="doEditWord(' + i + ')">确定</button></div>');
}
function doEditWord(i) {
  const text = $('mText').value.trim();
  if (!text) { toast('单词不能为空'); return; }
  const it = getMergedItems()[i];
  if (!it) return;
  const w = data.chapters[it.ci].words[it.wi];
  w.text = text;
  w.meaning = $('mMeaning').value.trim();
  saveData(); renderWords(); renderChapterList(); closeModal();
}