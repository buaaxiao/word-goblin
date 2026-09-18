/* ===================================================================
 * js/chapters.js - 章节列表核心
 *   - listVisibleSet 与相关工具
 *   - 章节列表渲染 / 选择 / 切换 / 增删
 *   - 拖拽排序
 *   - 表头复选框（全选/半选/未选、禁用态）
 *
 * 弹窗相关见 chapters-modals.js
 * 搜索下拉 + 打字机提示见 chapters-search.js
 * =================================================================== */

/* =================================================================
 * 列表显示集合：决定章节列表显示哪些章节
 *   - 存章节名称（不是索引）：data.chapters 增删改排序后名称稳定
 *   - 由「下拉面板」的勾选/取消、全选/全取消更新
 *   - 章节列表自身的表头复选框、行内复选框不改变它
 * ================================================================= */
let listVisibleSet = new Set(); // Set<chapterName>

// 数据加载 / 导入 / 同步后重建：把当前 selected 的章节名加入集合
function initListVisibleSet() {
  listVisibleSet.clear();
  data.chapters.forEach((ch) => {
    if (ch.selected) listVisibleSet.add(ch.name);
  });
}

// 防御性清洗：移除 data.chapters 里已不存在的名称
function pruneListVisibleSet() {
  const existing = new Set(data.chapters.map((ch) => ch.name));
  const next = new Set();
  listVisibleSet.forEach((name) => {
    if (existing.has(name)) next.add(name);
  });
  listVisibleSet = next;
}

// 判断某个章节是否在列表里可见
function isChapterVisible(ch) {
  return listVisibleSet.has(ch.name);
}

// 与 renderChapterList 一致的「列表可见章节」
function getVisibleChapters() {
  const q = (chapterSearchQuery || "").toLowerCase();
  return data.chapters
    .map((ch, ci) => ({ ch, ci }))
    .filter(({ ch }) => {
      if (!isChapterVisible(ch)) return false;
      if (q && ch.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
}

/* ===== 章节表头：全选 / 取消全选（章节列表自身） ===== */

// 更新章节列表表头复选框状态（基于列表可见章节的全选 / 半选 / 未选）
//   - 列表无可见章节 → 禁用
//   - 列表有可见章节 → 启用，并根据勾选情况显示
function updateChapterHeaderCheckbox() {
  const cb = $("selectAllChapters");
  if (!cb) return;

  const visibleList = getVisibleChapters();

  if (visibleList.length === 0) {
    cb.checked = false;
    cb.indeterminate = false;
    cb.disabled = true;
    return;
  }

  cb.disabled = false;

  const selected = visibleList.filter(({ ch }) => ch.selected).length;
  if (selected === visibleList.length) {
    cb.checked = true;
    cb.indeterminate = false;
  } else if (selected === 0) {
    cb.checked = false;
    cb.indeterminate = false;
  } else {
    cb.checked = false;
    cb.indeterminate = true;
  }
}

// 章节列表表头复选框：只改 selected，不动 listVisibleSet
//   只对「列表里当前可见的章节」生效
function toggleSelectAllChapters(checked) {
  const visibleList = getVisibleChapters();
  if (!visibleList.length) {
    toast("暂无章节");
    return;
  }

  visibleList.forEach(({ ci }) => {
    data.chapters[ci].selected = !!checked;
    // ★ 不动 listVisibleSet —— 章节列表条数不变
  });

  saveData();
  renderChapterList();
  renderWords();
  const cb = $("selectAllChapters");
  if (cb) cb.indeterminate = false;
}

let dragSrcIndex = null;
let dragOverIndex = null;

function renderChapterList() {
  // ★ 每次渲染前先清理悬空名称（防御性）
  pruneListVisibleSet();

  const el = $("chapterList");
  el.innerHTML = "";
  const badge = $("chapterCountBadge");

  let filtered = data.chapters.map((ch, ci) => ({ ch, ci }));

  if (chapterSearchQuery) {
    const q = chapterSearchQuery.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        isChapterVisible(item.ch) && item.ch.name.toLowerCase().indexOf(q) >= 0,
    );
  } else {
    filtered = filtered.filter((item) => isChapterVisible(item.ch));
  }

  if (badge) {
    if (chapterSearchQuery) {
      badge.textContent = "找到 " + filtered.length + " 个";
    } else {
      const selected = data.chapters.filter((c) => c.selected).length;
      badge.textContent =
        data.chapters.length + " 章节" + (selected ? " · 选 " + selected : "");
    }
  }

  if (!filtered.length) {
    if (chapterSearchQuery) {
      el.innerHTML =
        '<div class="empty-state searching">未找到匹配的章节</div>';
    } else if (listVisibleSet.size === 0) {
      el.innerHTML =
        '<div class="empty-state">请从搜索框下拉列表中勾选章节</div>';
    } else {
      el.innerHTML = '<div class="empty-state">暂无章节</div>';
    }
    updateChapterHeaderCheckbox();
    updateStats();
    return;
  }

  filtered.forEach(({ ch, ci }) => {
    const d = document.createElement("div");
    const viewMode = chapterMode === "view";
    d.className =
      "chapter-item" +
      (ci === currentChapter ? " active" : "") +
      (viewMode ? " view-mode" : "");
    d.setAttribute("draggable", viewMode ? "false" : "true");
    d.dataset.index = ci;

    const handleHtml = viewMode
      ? '<span class="drag-handle disabled" title="查看模式下不可拖拽">≡</span>'
      : '<span class="drag-handle" title="拖动排序">≡</span>';

    const checkboxHtml =
      '<input type="checkbox" ' +
      (ch.selected ? "checked " : "") +
      'onchange="toggleChapter(' +
      ci +
      ', this.checked)">';

    const nameHtml =
      '<span class="name" title="' +
      esc(ch.name) +
      '" onclick="selectChapter(' +
      ci +
      ')">' +
      highlightText(ch.name, chapterSearchQuery) +
      "</span>";

    const countHtml =
      '<span class="count" title="' +
      ch.words.length +
      ' 个单词">' +
      ch.words.length +
      " 词" +
      "</span>";

    const editBtnHtml = viewMode
      ? '<button class="icon-btn disabled" disabled title="查看模式下不可操作">✎</button>'
      : '<button class="icon-btn" onclick="renameChapter(' +
        ci +
        ')" title="修改">✎</button>';

    const delBtnHtml = viewMode
      ? '<button class="icon-btn disabled" disabled title="查看模式下不可操作">🗑</button>'
      : '<button class="icon-btn" onclick="deleteChapter(' +
        ci +
        ')" title="删除">🗑</button>';

    d.innerHTML =
      handleHtml +
      checkboxHtml +
      nameHtml +
      countHtml +
      editBtnHtml +
      delBtnHtml;

    if (!viewMode) {
      d.addEventListener("dragstart", function (e) {
        dragSrcIndex = ci;
        d.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ci);
        try {
          e.dataTransfer.setData("text/html", d.innerHTML);
        } catch (ex) {}
      });
      d.addEventListener("dragend", function () {
        d.classList.remove("dragging");
        clearDragOverStyles();
        dragSrcIndex = null;
        dragOverIndex = null;
      });
      d.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragSrcIndex === null || dragSrcIndex === ci) return;
        clearDragOverStyles();
        const rect = d.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          d.classList.add("drag-over");
          dragOverIndex = { index: ci, position: "before" };
        } else {
          d.classList.add("drag-over-bottom");
          dragOverIndex = { index: ci, position: "after" };
        }
      });
      d.addEventListener("dragleave", function () {
        d.classList.remove("drag-over", "drag-over-bottom");
      });
      d.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (dragSrcIndex === null || dragSrcIndex === ci) return;
        if (!dragOverIndex) return;
        performReorder(
          dragSrcIndex,
          dragOverIndex.index,
          dragOverIndex.position,
        );
      });
    }

    el.appendChild(d);
  });

  updateChapterHeaderCheckbox();
  updateStats();
}

function clearDragOverStyles() {
  document.querySelectorAll(".chapter-item").forEach((item) => {
    item.classList.remove("drag-over", "drag-over-bottom");
  });
}

function performReorder(srcIndex, targetIndex, position) {
  if (srcIndex === targetIndex) return;
  const item = data.chapters.splice(srcIndex, 1)[0];
  let insertIndex = targetIndex;
  if (srcIndex < targetIndex) insertIndex--;
  if (position === "after") insertIndex++;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > data.chapters.length) insertIndex = data.chapters.length;
  data.chapters.splice(insertIndex, 0, item);

  if (currentChapter === srcIndex) {
    currentChapter = insertIndex;
  } else {
    if (srcIndex < currentChapter && insertIndex >= currentChapter)
      currentChapter--;
    else if (srcIndex > currentChapter && insertIndex <= currentChapter)
      currentChapter++;
  }

  // listVisibleSet 存名称，排序不影响

  saveData();
  renderChapterList();
  renderWords();
  toast("章节排序已更新");
}

// 点击章节行：已勾选 → 取消勾选；未勾选 → 勾选并设为当前章节
function selectChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return;

  if (ch.selected) {
    ch.selected = false;
    listVisibleSet.delete(ch.name);
  } else {
    ch.selected = true;
    currentChapter = ci;
    listVisibleSet.add(ch.name);
  }

  saveData();
  renderChapterList();
  renderWords();
}

// 章节列表行内复选框：只改 selected，不动 listVisibleSet
function toggleChapter(ci, checked) {
  data.chapters[ci].selected = checked;
  saveData();
  renderChapterList();
  renderWords();
}

function addChapter(name, dictLang) {
  name = (name || "").trim();
  if (!name) {
    toast("请输入章节名称");
    return;
  }
  if (name.length > 30) {
    toast("章节名称不能超过 30 个字符");
    return;
  }
  if (data.chapters.some((c) => c.name === name)) {
    toast("章节「" + name + "」已存在，只能通过编辑修改，不能重复添加");
    return;
  }
  data.chapters.push({
    name: name,
    selected: false,
    words: [],
    dictLang: typeof dictLang === "number" ? dictLang : getDefaultDictLang(),
  });
  currentChapter = data.chapters.length - 1;
  saveData();
  renderChapterList();
  renderWords();
}

function deleteChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return;

  const wordCount = (ch.words || []).length;
  const wordInfo =
    wordCount > 0
      ? "<br>该章节包含 <b>" + wordCount + "</b> 个单词，将一并删除。"
      : "";

  confirmDialog(
    "删除章节",
    "确定删除章节 <b>" +
      esc(ch.name) +
      "</b> 吗？" +
      wordInfo +
      "<br>" +
      "此操作不可撤销。",
    function () {
      doDeleteChapter(ci);
    },
  );
}

function doDeleteChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return;

  // 同步移除该章节名
  listVisibleSet.delete(ch.name);

  data.chapters.splice(ci, 1);

  if (currentChapter >= data.chapters.length) {
    currentChapter = Math.max(0, data.chapters.length - 1);
  }

  saveData();
  renderChapterList();
  renderWords();
  updateStats();
  toast("已删除章节");
}
