/* ===================================================================
 * js/main.js — 应用入口
 *
 * 说明：
 *   - 设置 / 统计 / 默写三个弹窗的 HTML 和 open/close 分别在
 *     partials/settings-modal.js、partials/stats-modal.js、
 *     partials/dictation-modal.js 里
 *   - 本文件只提供：#modal 的通用封装 + 底层 openModalEl / closeModalEl
 *     + 全局事件 + 应用初始化
 * =================================================================== */

// ===================================================================
// 一、通用弹窗：#modal 的内容填充 + 打开/关闭（唯一业务封装）
// ===================================================================
/**
 * 给 #modalBody 填充内容（不负责显示弹窗）
 * @param {string} title
 * @param {string} bodyHtml
 * @returns {boolean}
 */
function fillModalBody(title, bodyHtml) {
  const b = document.getElementById("modalBody");
  if (!b) return false;
  b.innerHTML =
    '<div class="modal-head">' +
    "<h2>" +
    esc(title) +
    '</h2><button class="modal-close" onclick="closeModal()" title="关闭">✕</button></div>' +
    bodyHtml;
  return true;
}

/**
 * 打开通用弹窗 #modal（填内容 + 显示）
 * @param {string} title
 * @param {string} bodyHtml
 * @param {Function} [onOpened] 打开后回调（可选）
 */
function openModal(title, bodyHtml, onOpened) {
  const m = document.getElementById("modal");
  if (!m) return;
  if (!fillModalBody(title, bodyHtml)) return;
  openModalEl(m, onOpened);
}

/**
 * 关闭通用弹窗 #modal
 */
function closeModal() {
  const m = document.getElementById("modal");
  const b = document.getElementById("modalBody");
  if (m) closeModalEl(m);
  if (b) b.innerHTML = "";
}

// ===================================================================
// 二、底层：任意 .modal 元素的显示/隐藏
//   - 焦点栈 + 锁滚动（position: fixed 版）+ 自动聚焦
//   - 用 position: fixed 锁滚动，避免原生 <select> 展开浮层坐标错位
// ===================================================================
const __modalFocusStack = [];
let __bodyScrollY = 0;

function getFocusable(root) {
  return Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}

/**
 * 显示弹窗元素
 * @param {HTMLElement} el
 * @param {Function} [onOpened] 焦点已聚焦后回调（可选）
 */
function openModalEl(el, onOpened) {
  if (!el) return;
  __modalFocusStack.push(document.activeElement);

  // ★ 锁滚动：只在"第一个弹窗打开"时记录 scrollY，并给 body 加 modal-open
  if (!document.body.classList.contains("modal-open")) {
    __bodyScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = -__bodyScrollY + "px";
    document.body.classList.add("modal-open");
  }

  el.classList.remove("hidden");

  const focusables = getFocusable(el);
  const first =
    focusables.find((x) => x.classList.contains("primary")) || focusables[0];

  setTimeout(function () {
    if (first) {
      try {
        first.focus();
      } catch (e) {}
    }
    if (typeof onOpened === "function") {
      try {
        onOpened(el);
      } catch (e) {
        console.error("openModalEl onOpened 回调失败：", e);
      }
    }
  }, 0);
}

function closeModalEl(el) {
  if (!el) return;
  el.classList.add("hidden");

  // ★ 所有弹窗都关闭后：解锁 body 滚动，并恢复滚动位置
  if (!document.querySelector(".modal:not(.hidden)")) {
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, __bodyScrollY);
  }

  const prev = __modalFocusStack.pop();
  if (prev && document.contains(prev)) {
    try {
      prev.focus();
    } catch (e) {}
  }
}

// ===================================================================
// 三、取得当前「最上层」打开的 modal
// ===================================================================
function getTopModal() {
  const list = Array.from(document.querySelectorAll(".modal:not(.hidden)"));
  if (!list.length) return null;
  return list.reduce((top, cur) => {
    const zTop = parseInt(getComputedStyle(top).zIndex || "0", 10);
    const zCur = parseInt(getComputedStyle(cur).zIndex || "0", 10);
    if (zCur > zTop) return cur;
    if (zCur === zTop) {
      return top.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING
        ? cur
        : top;
    }
    return top;
  });
}

// ===================================================================
// 四、全局事件绑定
// ===================================================================
function bindGlobalEvents() {
  // 遮罩点击关闭
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", function (e) {
      if (e.target !== modal) return;

      // ★ 默写弹窗：走 closeDict()，触发停止播报 + 确认框
      if (modal.id === "dictModal" && typeof closeDict === "function") {
        closeDict();
        return;
      }

      closeModalEl(modal);
    });
  });

  // Esc 关闭最上层弹窗
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;

    // ★ 优先：章节搜索下拉面板打开时，先关它
    const comboPanel = document.getElementById("chapterComboPanel");
    if (comboPanel && !comboPanel.classList.contains("hidden")) {
      if (typeof closeChapterCombo === "function") {
        closeChapterCombo();
      } else {
        comboPanel.classList.add("hidden");
      }
      e.preventDefault();
      return;
    }

    const top = getTopModal();
    if (!top) return;

    // ★ 默写弹窗：走 closeDict()
    if (top.id === "dictModal" && typeof closeDict === "function") {
      closeDict();
      return;
    }

    closeModalEl(top);
  });

  // Tab 焦点循环
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    const top = getTopModal();
    if (!top) return;

    const focusables = getFocusable(top);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // 数据操作下拉：点击外部收起
  document.addEventListener("click", function (e) {
    const ops = document.querySelector(".data-ops");
    if (!ops) return;
    if (ops.contains(e.target)) return;
    if (document.activeElement === ops) ops.blur();
  });
}

// ===================================================================
// 五、安全调用
// ===================================================================
function safeCall(name) {
  const fn = window[name];
  if (typeof fn === "function") {
    try {
      fn();
    } catch (e) {
      console.error("调用 " + name + " 失败：", e);
    }
  } else {
    console.warn("[main.js] 跳过未定义函数：" + name);
  }
}

// ===================================================================
// 六、应用初始化
// ===================================================================
async function initApp() {
  try {
    // 1. 数据加载（异步）
    if (typeof loadData === "function") await loadData();

    // ★ 2. 设置：从持久化恢复到 config（必须在 loadTheme 等之前）
    if (typeof loadConfigFromStorage === "function") {
      await loadConfigFromStorage();
    }
    if (typeof migrateSettingsToIDB === "function") {
      await migrateSettingsToIDB();
    }

    // 3. 小配置
    if (typeof loadTheme === "function") loadTheme();
    if (typeof loadDedupe === "function") loadDedupe();
    if (typeof loadCollapseState === "function") loadCollapseState();
    if (typeof loadListMode === "function") loadListMode();

    // ★ 4. 首次加载：0 词则折叠章节；应用列表模式到 UI
    if (typeof applyCollapseState === "function") applyCollapseState(true);
    if (typeof applyModesUI === "function") applyModesUI();

    // 5. listVisibleSet
    if (typeof initListVisibleSet === "function") initListVisibleSet();

    // 6. 渲染
    if (typeof renderChapterList === "function") renderChapterList();
    if (typeof renderWords === "function") renderWords();
    if (typeof updateStats === "function") updateStats();

    // 7. 事件
    if (typeof bindGlobalEvents === "function") bindGlobalEvents();
    if (typeof initChapterSearchHint === "function") initChapterSearchHint();

    console.log("[单词精灵] 初始化完成");
  } catch (e) {
    console.error("initApp 失败：", e);
  }
}

//

// ===================================================================
// 七、启动（唯一入口）
// ===================================================================
(function boot() {
  document.body.classList.add("preload");

  // 弹窗 HTML 改为惰性填充（partials 里各自填充），
  // 不再需要启动时 injectPartials()

  initApp()
    .catch((e) => {
      console.error("应用初始化失败：", e);
      if (typeof toast === "function") {
        toast("应用初始化失败：" + (e && e.message ? e.message : e));
      }
    })
    .finally(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.classList.remove("preload");
        });
      });
    });
})();
