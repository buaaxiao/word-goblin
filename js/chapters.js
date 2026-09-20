/* ===================================================================
 * js/chapters.js - 章节列表核心
 *   - listVisibleSet / tempVisibleChapters 与相关工具
 *   - 章节列表渲染 / 选择 / 切换 / 增删
 *   - 拖拽排序
 *   - 表头复选框（全选/半选/未选、禁用态）
 *   - 无可见章节时自动折叠章节列表
 *   - 表头点击排序
 *
 * 弹窗相关见 chapters-modals.js
 * 搜索下拉 + 打字机提示见 chapters-search.js
 * =================================================================== */

/* =================================================================
 * 列表显示集合：决定章节列表显示哪些章节
 *   - listVisibleSet：存章节名称（来自下拉面板的勾选）
 *   - tempVisibleChapters：存章节索引（在列表内取消勾选的临时保留）
 *   - 两个集合任一命中即显示
 * =================================================================== */
let listVisibleSet = new Set(); // Set<chapterName>
let tempVisibleChapters = new Set(); // Set<chapterIndex>

/* =================================================================
 * 章节排序状态
 *   - null：不排序（按 data.chapters 原顺序）
 *   - { field: 'name' | 'count', order: 'asc' | 'desc' }
 * =================================================================== */
let chapterSort = null;

// 数据加载 / 导入 / 同步后重建：把当前 selected 的章节名加入集合
function initListVisibleSet() {
  listVisibleSet.clear();
  tempVisibleChapters.clear();
  data.chapters.forEach((ch) => {
    if (ch.selected) listVisibleSet.add(ch.name);
  });
}

// 防御性清洗
function pruneListVisibleSet() {
  const existing = new Set(data.chapters.map((ch) => ch.name));
  const nextNames = new Set();
  listVisibleSet.forEach((name) => {
    if (existing.has(name)) nextNames.add(name);
  });
  listVisibleSet = nextNames;

  const maxIdx = data.chapters.length;
  const nextIdx = new Set();
  tempVisibleChapters.forEach((i) => {
    if (i >= 0 && i < maxIdx) nextIdx.add(i);
  });
  tempVisibleChapters = nextIdx;
}

// 判断某个章节是否在列表里可见
function isChapterVisible(ch, ci) {
  return listVisibleSet.has(ch.name) || tempVisibleChapters.has(ci);
}

// 与 renderChapterList 一致的「列表可见章节」
function getVisibleChapters() {
  const q = (chapterSearchQuery || "").toLowerCase();
  return data.chapters
    .map((ch, ci) => ({ ch, ci }))
    .filter(({ ch, ci }) => {
      if (!isChapterVisible(ch, ci)) return false;
      if (q && ch.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
}

/* =================================================================
 * 自动折叠：当章节列表没有可见章节时，收起 collapse-body
 *   展开由「下拉面板勾选」触发的 autoExpandChapterListIfAny()（在 chapters-search.js）
 * ================================================================= */
function autoCollapseChapterIfEmpty() {
  if (typeof collapseState === "undefined") return;
  if (collapseState.chapter === true) return; // 已折叠

  collapseState.chapter = true;
  if (typeof saveCollapseState === "function") saveCollapseState();
  if (typeof applyCollapseState === "function") applyCollapseState();
}

/* =================================================================
 * 章节表头排序
 * ================================================================= */
function toggleChapterSort(field) {
  if (!chapterSort || chapterSort.field !== field) {
    chapterSort = { field, order: "asc" };
  } else if (chapterSort.order === "asc") {
    chapterSort = { field, order: "desc" };
  } else {
    chapterSort = null; // 第三次点击：取消排序
  }
  renderChapterList();
}

// 更新章节表头的排序图标
function updateChapterSortIcons() {
  const header = document.querySelector(".chapter-table-header");
  if (!header) return;
  header.querySelectorAll(".sortable").forEach((el) => {
    const icon = el.querySelector(".sort-icon");
    if (!icon) return;
    const onclick = el.getAttribute("onclick") || "";
    const m = onclick.match(/'([^']+)'/);
    const field = m ? m[1] : "";
    if (chapterSort && chapterSort.field === field) {
      icon.textContent = chapterSort.order === "asc" ? "↑" : "↓";
      el.classList.add("sorted");
    } else {
      icon.textContent = "";
      el.classList.remove("sorted");
    }
  });
}

/* ===== 章节表头：全选 / 取消全选 ===== */

function updateChapterHeaderCheckbox() {
  const cb = $("selectAllChapters");
  if (!cb) return;

  const visibleList = getVisibleChapters();

  if (visibleList.length === 0) {
    cb.checked = false;
    cb.indeterminate = false;
    // ★ 不用 disabled 属性，用 aria-disabled + class，保证 hover 生效
    cb.setAttribute("aria-disabled", "true");
    cb.classList.add("disabled");
    cb.title = "当前列表没有可操作的章节";
    return;
  }

  cb.removeAttribute("aria-disabled");
  cb.classList.remove("disabled");
  cb.title = "全选 / 取消全选";

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

// 章节列表表头复选框：只改 selected，不动 listVisibleSet / tempVisibleChapters
function toggleSelectAllChapters(checked) {
  const visibleList = getVisibleChapters();
  if (!visibleList.length) {
    toast("当前列表没有可操作的章节");
    return;
  }

  visibleList.forEach(({ ch, ci }) => {
    data.chapters[ci].selected = !!checked;

    if (checked) {
      listVisibleSet.add(ch.name);
      tempVisibleChapters.delete(ci);
    } else {
      listVisibleSet.delete(ch.name);
      tempVisibleChapters.delete(ci);
    }
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
  pruneListVisibleSet();

  const el = $("chapterList");
  el.innerHTML = "";
  const badge = $("chapterCountBadge");

  let filtered = data.chapters.map((ch, ci) => ({ ch, ci }));

  if (chapterSearchQuery) {
    const q = chapterSearchQuery.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        isChapterVisible(item.ch, item.ci) &&
        item.ch.name.toLowerCase().indexOf(q) >= 0,
    );
  } else {
    filtered = filtered.filter((item) => isChapterVisible(item.ch, item.ci));
  }

  // ===== 应用排序（仅对可见章节排序，不影响 data.chapters 原顺序） =====
  if (chapterSort) {
    const { field, order } = chapterSort;
    const dir = order === "desc" ? -1 : 1;
    filtered.sort((a, b) => {
      let va, vb;
      if (field === "name") {
        va = (a.ch.name || "").toLowerCase();
        vb = (b.ch.name || "").toLowerCase();
      } else if (field === "count") {
        va = (a.ch.words || []).length;
        vb = (b.ch.words || []).length;
      } else {
        return 0;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  // ===== 徽章文字 =====
  if (badge) {
    if (chapterSearchQuery) {
      badge.textContent = "找到 " + filtered.length + " 个";
    } else {
      const selected = data.chapters.filter((c) => c.selected).length;
      const total = data.chapters.length;
      if (selected === 0) {
        // ★ 无已选章节 → 提示去搜索栏选定
        badge.textContent = "未在搜索栏中选定章节";
      } else {
        badge.textContent = total + " 章节 · 选 " + selected;
      }
    }
  }

  // ===== 无可见章节 =====
  if (!filtered.length) {
    if (chapterSearchQuery) {
      el.innerHTML =
        '<div class="empty-state searching">未找到匹配的章节</div>';
    } else if (listVisibleSet.size === 0 && tempVisibleChapters.size === 0) {
      el.innerHTML =
        '<div class="empty-state">请从搜索框下拉列表中勾选章节</div>';
    } else {
      el.innerHTML = '<div class="empty-state">暂无章节</div>';
    }
    updateChapterHeaderCheckbox();
    updateChapterSortIcons();
    updateStats();

    // ★ 无可见章节 → 自动折叠章节列表
    autoCollapseChapterIfEmpty();
    return;
  }

  // ===== 有可见章节 → 渲染行 =====
  filtered.forEach(({ ch, ci }) => {
    const d = document.createElement("div");
    const viewMode = config.chapterMode === "view";
    d.className =
      "chapter-item" +
      (ci === currentChapter ? " active" : "") +
      (viewMode ? " view-mode" : "");
    d.setAttribute("draggable", viewMode ? "false" : "true");
    d.dataset.index = ci;

    // 手柄：查看模式灰显
    const handleHtml = viewMode
      ? '<span class="drag-handle disabled" title="查看模式下不可拖拽" ' +
        "onclick=\"showDisabledTip(event, '拖拽', '查看模式')\">≡</span>"
      : '<span class="drag-handle" title="拖动排序">≡</span>';

    // 复选框：查看/编辑都可勾选
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

    // 编辑/删除：不用 disabled 属性，改用 .disabled class + onclick 提示
    const editBtnHtml = viewMode
      ? '<button class="icon-btn disabled" title="查看模式下不可编辑" ' +
        "onclick=\"showDisabledTip(event, '编辑', '查看模式')\">✎</button>"
      : '<button class="icon-btn" onclick="renameChapter(' +
        ci +
        ')" title="修改">✎</button>';

    const delBtnHtml = viewMode
      ? '<button class="icon-btn disabled" title="查看模式下不可删除" ' +
        "onclick=\"showDisabledTip(event, '删除', '查看模式')\">🗑</button>"
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
  updateChapterSortIcons();
  updateStats();

  // ★ 有可见章节 → 不强制展开（尊重用户手动折叠）
  //    展开由「下拉面板勾选」触发的 autoExpandChapterListIfAny() 完成
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

  tempVisibleChapters.clear();

  // ★ 手动拖拽后，取消排序状态（避免显示顺序与 data 顺序不一致的困惑）
  chapterSort = null;

  saveData();
  renderChapterList();
  renderWords();
  toast("章节排序已更新");
}

// 点击章节行
function selectChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return;

  if (ch.selected) {
    ch.selected = false;
    listVisibleSet.delete(ch.name);
    tempVisibleChapters.delete(ci); // ★ 不再保留
  } else {
    ch.selected = true;
    currentChapter = ci;
    listVisibleSet.add(ch.name);
    tempVisibleChapters.delete(ci);
  }

  saveData();
  renderChapterList();
  renderWords();
}

// 章节列表行内复选框
function toggleChapter(ci, checked) {
  const ch = data.chapters[ci];
  ch.selected = checked;

  if (checked) {
    listVisibleSet.add(ch.name);
    tempVisibleChapters.delete(ci);
  } else {
    listVisibleSet.delete(ch.name); // ★ 从可见集合移除
    tempVisibleChapters.delete(ci); // ★ 也不留临时可见
  }

  saveData();
  renderChapterList();
  renderWords();
}

function addChapter(name) {
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
    _id: genId("ch_"), // ★ 新增
    name: name,
    selected: false,
    words: [],
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

  openConfirmModal({
    title: "删除章节",
    body:
      "确定删除章节 <b>" +
      esc(ch.name) +
      "</b> 吗？" +
      wordInfo +
      "<br>此操作不可撤销。",
    danger: true, // ★ √ 按钮变红
    okTitle: "删除",
    onOk: function () {
      return doDeleteChapter(ci);
    },
  });
}

function doDeleteChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return false;

  listVisibleSet.delete(ch.name);
  tempVisibleChapters.clear();
  data.chapters.splice(ci, 1);

  if (currentChapter >= data.chapters.length) {
    currentChapter = Math.max(0, data.chapters.length - 1);
  }

  saveData();
  renderChapterList();
  renderWords();
  updateStats();
  toast("已删除");
}

/* =================================================================
 * 禁用按钮的点击提示
 *   - showDisabledTip 供所有模块共用（chapters.js / words.js）
 *   - 按 reason 给出不同的解决方案提示
 * ================================================================= */
function showDisabledTip(e, actionName, reason) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  let hint = "";
  switch (reason) {
    case "查看模式":
      hint = "查看模式下不可" + actionName + "，请切换到编辑模式";
      break;
    case "多章节合集":
      hint = "多章节合集下不可" + actionName + "，请只选中一个章节";
      break;
    case "去重模式":
      hint = "去重模式下不可" + actionName + "，请关闭去重后重试";
      break;
    case "单词数不足":
      hint = "单词数不足 2 个时不可" + actionName;
      break;
    default:
      hint = (reason ? reason + "下" : "当前状态下") + "不可" + actionName;
  }
  toast(hint);
}
