/* ===================================================================
 * js/chapters.js - 章节列表 / 排序 / 全选
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */
/* ===== 章节表头：全选 / 取消全选 ===== */

// 更新表头复选框状态（全选 / 半选 / 未选）
function updateChapterHeaderCheckbox() {
  const cb = $('selectAllChapters');
  if (!cb) return;
  const total = data.chapters.length;
  if (total === 0) {
    cb.checked = false;
    cb.indeterminate = false;
    return;
  }
  const selected = data.chapters.filter(c => c.selected).length;
  if (selected === total) {
    cb.checked = true;
    cb.indeterminate = false;
  } else if (selected === 0) {
    cb.checked = false;
    cb.indeterminate = false;
  } else {
    cb.checked = false;
    cb.indeterminate = true; // 半选状态
  }
}

// 表头首个复选框：勾选 = 全选，取消勾选 = 取消全选（半选状态再点击也视为全选）
function toggleSelectAllChapters(checked) {
  if (!data.chapters.length) { toast('暂无章节'); return; }
  data.chapters.forEach(ch => ch.selected = checked);
  saveData();
  renderChapterList();
  renderWords();
  const cb = $('selectAllChapters');
  if (cb) cb.indeterminate = false;
}

let dragSrcIndex = null;
let dragOverIndex = null;

function renderChapterList() {
  const el = $('chapterList');
  el.innerHTML = '';
  const badge = $('chapterCountBadge');

  let filtered = data.chapters.map((ch, ci) => ({ ch, ci }));
  if (chapterSearchQuery) {
    const q = chapterSearchQuery.toLowerCase();
    filtered = filtered.filter(item => item.ch.name.toLowerCase().indexOf(q) >= 0);
  }

  if (badge) {
    if (chapterSearchQuery) {
      badge.textContent = '找到 ' + filtered.length + ' 个';
    } else {
      const selected = data.chapters.filter(c => c.selected).length;
      badge.textContent = data.chapters.length + ' 章节' + (selected ? ' · 选 ' + selected : '');
    }
  }

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state searching">未找到匹配的章节</div>';
    updateChapterHeaderCheckbox();
    updateStats();
    return;
  }

  filtered.forEach(({ ch, ci }) => {
    const d = document.createElement('div');
    const viewMode = chapterMode === 'view';
    d.className = 'chapter-item' + (ci === currentChapter ? ' active' : '') + (viewMode ? ' view-mode' : '');
    d.setAttribute('draggable', viewMode ? 'false' : 'true');
    d.dataset.index = ci;
    d.innerHTML = viewMode
      ? '<span class="name" title="' + esc(ch.name) + '" onclick="selectChapter(' + ci + ')">' + highlightText(ch.name, chapterSearchQuery) + '</span>' +
        '<span class="count" title="' + ch.words.length + ' 个单词">' + ch.words.length + ' 词</span>'
      : '<span class="drag-handle" title="拖动排序">≡</span>' +
        '<input type="checkbox" ' + (ch.selected ? 'checked' : '') + ' onchange="toggleChapter(' + ci + ', this.checked)">' +
        '<span class="name" title="' + esc(ch.name) + '" onclick="selectChapter(' + ci + ')">' + highlightText(ch.name, chapterSearchQuery) + '</span>' +
        '<span class="count" title="' + ch.words.length + ' 个单词">' + ch.words.length + ' 词</span>' +
        '<span class="ch-actions">' +
          '<button class="icon-btn" onclick="renameChapter(' + ci + ')" title="修改">✎</button>' +
          '<button class="icon-btn" onclick="deleteChapter(' + ci + ')" title="删除">🗑</button>' +
        '</span>';

    if (!viewMode) {
      d.addEventListener('dragstart', function (e) {
        dragSrcIndex = ci;
        d.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ci);
        try { e.dataTransfer.setData('text/html', d.innerHTML); } catch (ex) {}
      });
      d.addEventListener('dragend', function () {
        d.classList.remove('dragging');
        clearDragOverStyles();
        dragSrcIndex = null;
        dragOverIndex = null;
      });
      d.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragSrcIndex === null || dragSrcIndex === ci) return;
        clearDragOverStyles();
        const rect = d.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          d.classList.add('drag-over');
          dragOverIndex = { index: ci, position: 'before' };
        } else {
          d.classList.add('drag-over-bottom');
          dragOverIndex = { index: ci, position: 'after' };
        }
      });
      d.addEventListener('dragleave', function () {
        d.classList.remove('drag-over', 'drag-over-bottom');
      });
      d.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (dragSrcIndex === null || dragSrcIndex === ci) return;
        if (!dragOverIndex) return;
        performReorder(dragSrcIndex, dragOverIndex.index, dragOverIndex.position);
      });
    }

    el.appendChild(d);
  });

  updateChapterHeaderCheckbox();
  updateStats();
}

function clearDragOverStyles() {
  document.querySelectorAll('.chapter-item').forEach(item => {
    item.classList.remove('drag-over', 'drag-over-bottom');
  });
}

function performReorder(srcIndex, targetIndex, position) {
  if (srcIndex === targetIndex) return;
  const item = data.chapters.splice(srcIndex, 1)[0];
  let insertIndex = targetIndex;
  if (srcIndex < targetIndex) insertIndex--;
  if (position === 'after') insertIndex++;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > data.chapters.length) insertIndex = data.chapters.length;
  data.chapters.splice(insertIndex, 0, item);

  if (currentChapter === srcIndex) {
    currentChapter = insertIndex;
  } else {
    if (srcIndex < currentChapter && insertIndex >= currentChapter) currentChapter--;
    else if (srcIndex > currentChapter && insertIndex <= currentChapter) currentChapter++;
  }

  saveData();
  renderChapterList();
  renderWords();
  toast('章节排序已更新');
}

function selectChapter(ci) {
  currentChapter = ci;
  data.chapters[ci].selected = true; // 单击即选中，复选框标记为勾选
  saveData();
  renderChapterList();
  renderWords();
}
function toggleChapter(ci, checked) {
  data.chapters[ci].selected = checked;
  saveData();
  renderChapterList();
  renderWords();
}

function addChapter(name, dictLang) {
  name = (name || '').trim();
  if (!name) { toast('请输入章节名称'); return; }
  if (name.length > 30) { toast('章节名称不能超过 30 个字符'); return; }
  if (data.chapters.some(c => c.name === name)) {
    toast('章节「' + name + '」已存在，只能通过编辑修改，不能重复添加');
    return;
  }
  data.chapters.push({ name: name, selected: false, words: [], dictLang: typeof dictLang === 'number' ? dictLang : getDefaultDictLang() }); // dictLang: 0=English 1=汉语，未指定时按设置界面默认
  currentChapter = data.chapters.length - 1;
  saveData(); renderChapterList(); renderWords();
}
// ===== 统一新增弹窗：上段新增章节、下段新增单词 =====
function openAddModal() {
  const chOptions = data.chapters.map((c, i) =>
    '<option value="' + i + '"' + (i === currentChapter ? ' selected' : '') + '>' + esc(c.name) + '</option>'
  ).join('');
  openModal('新增',
    '<div class="add-block">' +
      '<div class="add-title">📂 新增章节</div>' +
      '<div class="add-inline">' +
        '<input id="addChapterName" class="input" placeholder="输入章节名称">' +
        '<button class="primary" onclick="addChapterFromModal()">添加</button>' +
      '</div>' +
      '<label>报词方式</label>' +
      '<select id="addChapterLang">' +
        '<option value="0"' + (getDefaultDictLang() === 1 ? '' : ' selected') + '>English</option>' +
        '<option value="1"' + (getDefaultDictLang() === 1 ? ' selected' : '') + '>汉语</option>' +
      '</select>' +
    '</div>' +
    '<div class="add-divider"></div>' +
    '<div class="add-block">' +
      '<div class="add-title">📝 新增单词</div>' +
      '<label>所属章节</label>' +
      '<select id="addWordChapter">' + chOptions + '</select>' +
      '<label>单词/词语</label>' +
      '<input id="addWordText" class="input" placeholder="单词/词语">' +
      '<label>中文意思（英语单词填，可留空）</label>' +
      '<input id="addWordMeaning" class="input" placeholder="中文意思">' +
      '<button class="primary" style="width:100%;margin-top:2px" onclick="addWordFromModal()">添加单词</button>' +
    '</div>');
  const t = $('addChapterName');
  if (t) t.focus();
}
// 刷新“所属章节”下拉，沿用当前选中章节
function refreshAddWordSelect() {
  const sel = $('addWordChapter');
  if (!sel) return;
  const chOptions = data.chapters.map((c, i) =>
    '<option value="' + i + '"' + (i === currentChapter ? ' selected' : '') + '>' + esc(c.name) + '</option>'
  ).join('');
  sel.innerHTML = chOptions;
}
function addChapterFromModal() {
  const inp = $('addChapterName');
  const langEl = $('addChapterLang');
  addChapter(inp ? inp.value : '', langEl ? parseInt(langEl.value, 10) : getDefaultDictLang());
  if (inp && inp.value.trim()) inp.value = '';
  refreshAddWordSelect(); // 新章节加入下拉
  if (inp) inp.focus();
}
function addWordFromModal() {
  const text = $('addWordText') ? $('addWordText').value : '';
  const meaning = $('addWordMeaning') ? $('addWordMeaning').value : '';
  const sel = $('addWordChapter');
  addWord(text, meaning, sel ? parseInt(sel.value, 10) : NaN);
  const t = $('addWordText'), m = $('addWordMeaning');
  if (t) t.value = '';
  if (m) m.value = '';
  if (t) t.focus();
}
function deleteChapter(ci) {
  if (!confirm('确定删除章节「' + data.chapters[ci].name + '」及其所有单词吗？')) return;
  data.chapters.splice(ci, 1);
  if (currentChapter >= data.chapters.length) currentChapter = Math.max(0, data.chapters.length - 1);
  saveData(); renderChapterList(); renderWords();
}
// data.json 共享词库中各章节的报词方式（name -> dictLang），打开修改弹窗时优先取用
let cloudDictLang = null;
function loadCloudDictLang() {
  if (cloudDictLang !== null) return Promise.resolve(cloudDictLang);
  return fetch('data.json?_=' + Date.now())
    .then(r => { if (!r.ok) throw new Error('fetch'); return r.json(); })
    .then(obj => {
      const m = new Map();
      (obj.chapters || []).forEach(ch => { if (typeof ch.dictLang === 'number') m.set(ch.name, ch.dictLang); });
      cloudDictLang = m;
      return m;
    })
    .catch(() => { cloudDictLang = new Map(); return cloudDictLang; });
}
function renameChapter(ci) {
  const ch = data.chapters[ci];
  const localDl = (typeof ch.dictLang === 'number') ? ch.dictLang : getDefaultDictLang(); // 旧数据无 dictLang 时按设置界面默认
  // 报词方式初始值优先取 data.json 同名章节的 dictLang，无匹配时回退本地值
  loadCloudDictLang().then(m => {
    const dl = m.has(ch.name) ? m.get(ch.name) : localDl;
    openModal('修改章节',
      '<label>章节名称</label>' +
      '<input id="mInput" class="input" value="' + esc(ch.name) + '" placeholder="章节名称">' +
      '<label>报词方式</label>' +
      '<select id="mLang">' +
        '<option value="0"' + (dl === 1 ? '' : ' selected') + '>English</option>' +
        '<option value="1"' + (dl === 1 ? ' selected' : '') + '>汉语</option>' +
      '</select>' +
      '<div class="row"><button onclick="closeModal()">取消</button>' +
      '<button class="primary" onclick="doRenameChapter(' + ci + ')">确定</button></div>');
  });
}
function doRenameChapter(ci) {
  const v = $('mInput').value.trim();
  if (!v) { toast('名称不能为空'); return; }
  const dup = data.chapters.findIndex((c, i) => c.name === v && i !== ci);
  if (dup >= 0) { toast('已存在同名章节'); return; }
  const ml = $('mLang');
  if (ml) data.chapters[ci].dictLang = ml.value === '1' ? 1 : 0;
  data.chapters[ci].name = v;
  saveData(); renderChapterList(); renderWords(); closeModal();
}
