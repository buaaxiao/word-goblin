/* ===================================================================
 * js/chapters-search.js - 章节搜索：可编辑下拉列表 + 打字机提示
 *
 * 依赖：
 *   - chapters.js : renderChapterList, listVisibleSet, tempVisibleChapters
 *   - words.js    : renderWords
 *   - storage.js  : saveData
 *   - core.js     : $, esc, toast
 * =================================================================== */

/* =================================================================
 * 章节搜索：可编辑下拉列表
 *   下拉面板的选择行为决定章节列表显示哪些章节（listVisibleSet）
 * ================================================================= */

let comboActiveIndex = -1;

function openChapterCombo() {
  const panel = $("chapterComboPanel");
  if (!panel) return;

  // 已打开就不重复渲染（避免 focus 重复触发导致状态错乱）
  const wasHidden = panel.classList.contains("hidden");
  comboActiveIndex = -1;
  if (wasHidden) {
    renderChapterComboPanel();
    panel.classList.remove("hidden");
  }

  if (!openChapterCombo._bound) {
    openChapterCombo._bound = true;

    // 点击外部关闭
    document.addEventListener("click", function (e) {
      const wrap = $("chapterCombo");
      if (wrap && !wrap.contains(e.target)) closeChapterCombo();
    });

    // ★ 新增：input 点击时也尝试打开面板（focus 的兜底）
    //   场景：Esc 关闭面板后若 input 仍是 focus 状态，再点 input 不会触发
    //   focus 事件，靠这个 click 监听重新打开。
    const inp = $("chapterSearch");
    if (inp) {
      inp.addEventListener("click", function () {
        openChapterCombo();
      });
    }

    // ★ 不再注册全局 Esc 监听器：
    //   Esc 关闭改由 onChapterSearchKeydown 处理（只在输入框有焦点时生效）
    //   并由 main.js 的全局 Esc 处理兜底（优先关 combo）
  }
}

function closeChapterCombo() {
  const panel = $("chapterComboPanel");
  if (panel) panel.classList.add("hidden");
  comboActiveIndex = -1;
}

function toggleChapterCombo(e) {
  if (e) e.preventDefault();
  const panel = $("chapterComboPanel");
  if (!panel) return;
  if (panel.classList.contains("hidden")) {
    const inp = $("chapterSearch");
    if (inp) inp.focus();
    openChapterCombo();
  } else {
    closeChapterCombo();
  }
}

// 渲染面板列表：第一行为表头（全选/取消全选），下方为匹配搜索词的章节
function renderChapterComboPanel() {
  const panel = $("chapterComboPanel");
  if (!panel) return;

  const q = (chapterSearchQuery || "").toLowerCase();
  const list = data.chapters
    .map((ch, ci) => ({ ch, ci }))
    .filter(({ ch }) => !q || ch.name.toLowerCase().indexOf(q) >= 0);

  // ===== 表头行：全选 / 取消全选（基于当前搜索结果） =====
  const total = data.chapters.length;
  const selectedCount = data.chapters.filter((c) => c.selected).length;
  const allSelected = total > 0 && selectedCount === total;
  const noneSelected = selectedCount === 0;
  const headerChecked = allSelected ? "checked" : "";
  const headerIndeterminate =
    !allSelected && !noneSelected ? 'data-indeterminate="1"' : "";

  const headerHtml =
    '<label class="combo-item combo-header">' +
    '<input type="checkbox" id="comboSelectAll" ' +
    headerChecked +
    " " +
    headerIndeterminate +
    " " +
    'onchange="toggleSelectAllFromCombo(this.checked)">' +
    '<span class="combo-item-name">' +
    (q ? "搜索结果" : "全部章节") +
    "</span>" +
    '<span class="combo-item-count">' +
    list.length +
    " / " +
    total +
    "</span>" +
    "</label>";

  const listHtml = list
    .map(({ ch, ci }) => {
      const checked = ch.selected ? "checked" : "";
      return (
        '<label class="combo-item" data-ci="' +
        ci +
        '">' +
        '<input type="checkbox" ' +
        checked +
        " " +
        'onchange="toggleChapterFromCombo(' +
        ci +
        ', this.checked)">' +
        '<span class="combo-item-name">' +
        esc(ch.name) +
        "</span>" +
        '<span class="combo-item-count">' +
        (ch.words ? ch.words.length : 0) +
        " 词</span>" +
        "</label>"
      );
    })
    .join("");

  panel.innerHTML =
    headerHtml +
    (list.length
      ? listHtml
      : '<div class="combo-empty">未找到匹配的章节</div>');

  const sel = $("comboSelectAll");
  if (sel && headerIndeterminate) sel.indeterminate = true;
}

// 面板表头：全选 / 取消全选（基于当前搜索结果）
//   ★ 同时更新 selected 与 listVisibleSet（按名称）
//   ★ 面板操作会清掉对应的 tempVisibleChapters 索引
function toggleSelectAllFromCombo(checked) {
  const q = (chapterSearchQuery || "").toLowerCase();
  const list = data.chapters
    .map((ch, ci) => ({ ch, ci }))
    .filter(({ ch }) => !q || ch.name.toLowerCase().indexOf(q) >= 0);

  list.forEach(({ ch, ci }) => {
    ch.selected = !!checked;
    if (checked) {
      listVisibleSet.add(ch.name);
      tempVisibleChapters.delete(ci);
    } else {
      listVisibleSet.delete(ch.name);
      tempVisibleChapters.delete(ci); // 面板取消 → 列表立即移除
    }
  });

  saveData();
  renderChapterComboPanel();
  renderChapterList();
  renderWords();

  autoExpandChapterListIfAny();
}

// 面板内单项勾选/取消
//   ★ 同时更新 selected 与 listVisibleSet（按名称）
//   ★ 面板操作会清掉对应的 tempVisibleChapters 索引
function toggleChapterFromCombo(ci, checked) {
  if (!data.chapters[ci]) return;
  const ch = data.chapters[ci];
  ch.selected = !!checked;

  if (checked) {
    listVisibleSet.add(ch.name);
    tempVisibleChapters.delete(ci);
  } else {
    listVisibleSet.delete(ch.name);
    tempVisibleChapters.delete(ci); // 面板取消 → 列表立即移除
  }

  saveData();
  renderChapterComboPanel();
  renderChapterList();
  renderWords();

  autoExpandChapterListIfAny();
}

function onChapterSearchKeydown(e) {
  const panel = $("chapterComboPanel");
  if (!panel) return;

  // ★ Esc：关闭下拉面板（如果打开）
  //   只在搜索框内有焦点时触发；stopPropagation 阻止冒泡到 main.js 全局 Esc
  if (e.key === "Escape") {
    if (!panel.classList.contains("hidden")) {
      e.preventDefault();
      e.stopPropagation();
      closeChapterCombo();

      // ★ 关键修复：主动 blur 输入框
      //   因为 preventDefault 阻止了浏览器默认的"Esc 自动 blur input"行为，
      //   不主动 blur 的话 input 会保持 focus 状态，
      //   下次点击 input 不会再触发 focus 事件，导致面板打不开。
      const inp = $("chapterSearch");
      if (inp && document.activeElement === inp) inp.blur();
    }
    return;
  }

  if (panel.classList.contains("hidden")) {
    if (e.key === "ArrowDown") {
      openChapterCombo();
      e.preventDefault();
    }
    return;
  }

  const items = panel.querySelectorAll(".combo-item:not(.combo-header)");
  if (!items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    comboActiveIndex = Math.min(comboActiveIndex + 1, items.length - 1);
    updateComboActive(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    comboActiveIndex = Math.max(comboActiveIndex - 1, 0);
    updateComboActive(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (comboActiveIndex >= 0 && comboActiveIndex < items.length) {
      const cb = items[comboActiveIndex].querySelector("input[type=checkbox]");
      if (cb) {
        cb.checked = !cb.checked;
        cb.onchange();
      }
    }
  }
}

function updateComboActive(items) {
  items.forEach((it, i) =>
    it.classList.toggle("active", i === comboActiveIndex),
  );
  if (comboActiveIndex >= 0 && items[comboActiveIndex]) {
    items[comboActiveIndex].scrollIntoView({ block: "nearest" });
  }
}

// 输入框输入：清空临时可见集合，刷新章节列表 + 刷新下拉面板
function onChapterSearch() {
  tempVisibleChapters.clear(); // ★ 用户主动搜索时清空临时状态

  const inp = $("chapterSearch");
  const wrap = $("chapterCombo");
  chapterSearchQuery = inp ? inp.value.trim() : "";
  if (wrap) wrap.classList.toggle("has-text", !!chapterSearchQuery);
  renderChapterList();

  const panel = $("chapterComboPanel");
  if (panel) {
    comboActiveIndex = -1;
    renderChapterComboPanel();
    if (chapterSearchQuery && panel.classList.contains("hidden")) {
      panel.classList.remove("hidden");
    }
  }
}

// 清空输入：清空临时可见集合，关闭面板，恢复章节列表
function clearChapterSearch(e) {
  if (e) e.stopPropagation();

  tempVisibleChapters.clear(); // ★ 清空搜索时也清空临时状态

  const inp = $("chapterSearch");
  if (inp) inp.value = "";
  chapterSearchQuery = "";
  const wrap = $("chapterCombo");
  if (wrap) wrap.classList.remove("has-text");
  closeChapterCombo();

  // ★ 顺手 blur，保证下次点击 input 能再次触发 focus
  if (inp && document.activeElement === inp) inp.blur();

  renderChapterList();
}

/* =================================================================
 * 章节搜索框：打字机提示
 * ================================================================= */

const chapterSearchHintTexts = [
  "点击此处选择要默写的章节…",
  "输入章节名可快速筛选…",
  "可勾选一个或多个章节…",
];

let chapterSearchHintTimer = null;
let chapterSearchHintTextIdx = 0;
let chapterSearchHintCharIdx = 0;
let chapterSearchHintDeleting = false;

// 启动打字机循环
function startChapterSearchHintTyper() {
  const el = $("chapterSearchHint");
  if (!el) return;

  if (chapterSearchHintTimer) {
    clearTimeout(chapterSearchHintTimer);
    chapterSearchHintTimer = null;
  }

  const tick = () => {
    const combo = $("chapterCombo");
    const input = $("chapterSearch");
    if (!combo || !el) return;

    const focused = input && document.activeElement === input;
    if (combo.classList.contains("has-text") || focused) {
      el.textContent = "";
      chapterSearchHintTimer = setTimeout(tick, 400);
      return;
    }

    const text = chapterSearchHintTexts[chapterSearchHintTextIdx];

    if (!chapterSearchHintDeleting) {
      chapterSearchHintCharIdx++;
      el.textContent = text.slice(0, chapterSearchHintCharIdx);

      if (chapterSearchHintCharIdx >= text.length) {
        chapterSearchHintDeleting = true;
        chapterSearchHintTimer = setTimeout(tick, 3000);
        return;
      }
    } else {
      chapterSearchHintCharIdx--;
      el.textContent = text.slice(0, chapterSearchHintCharIdx);

      if (chapterSearchHintCharIdx <= 0) {
        chapterSearchHintDeleting = false;
        chapterSearchHintTextIdx =
          (chapterSearchHintTextIdx + 1) % chapterSearchHintTexts.length;
        chapterSearchHintTimer = setTimeout(tick, 400);
        return;
      }
    }

    chapterSearchHintTimer = setTimeout(
      tick,
      chapterSearchHintDeleting ? 100 : 80,
    );
  };

  tick();
}

// 页面初始化时调用一次
function initChapterSearchHint() {
  startChapterSearchHintTyper();
}

// 若章节列表可见集合非空，则自动展开章节列表
function autoExpandChapterListIfAny() {
  if (listVisibleSet.size === 0 && tempVisibleChapters.size === 0) return;
  if (typeof collapseState === "undefined") return;
  if (collapseState.chapter === false) return;

  collapseState.chapter = false;
  if (typeof saveCollapseState === "function") saveCollapseState();
  if (typeof applyCollapseState === "function") applyCollapseState();
}
