/* ===================================================================
 * js/main.js — 应用入口
 * =================================================================== */

// ===================================================================
// 一、注入弹窗 HTML（来自 partials/*.js 的字符串）
// ===================================================================
function injectPartials() {
  const map = {
    settingsModal: window.__PARTIAL_settingsModal,
    statsModal: window.__PARTIAL_statsModal,
    dictModal: window.__PARTIAL_dictModal,
  };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (el && map[id]) el.innerHTML = map[id];
  });
}

// ===================================================================
// 二、通用弹窗控制（#modal + #modalBody）
//     走 openModalEl / closeModalEl，保证焦点自动聚焦 & 返还
// ===================================================================
function openModal(title, bodyHtml) {
  const m = document.getElementById('modal');
  const b = document.getElementById('modalBody');
  if (!m || !b) return;
  b.innerHTML = '<h2>' + title + '</h2>' + bodyHtml;
  openModalEl(m);
}

function closeModal() {
  const m = document.getElementById('modal');
  const b = document.getElementById('modalBody');
  if (m) closeModalEl(m);
  if (b) b.innerHTML = '';
}

// ===================================================================
// 三、真正的 modal 打开/关闭（焦点栈、滚动锁定、焦点返还）
// ===================================================================
const __modalFocusStack = [];

function getFocusable(root) {
  return Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null);
}

function openModalEl(el) {
  if (!el) return;
  __modalFocusStack.push(document.activeElement);
  el.classList.remove('hidden');
  document.body.classList.add('modal-open');

  const focusables = getFocusable(el);
  const first =
    focusables.find(x => x.classList.contains('primary')) ||
    focusables[0];
  if (first) setTimeout(() => { try { first.focus(); } catch (e) { } }, 0);
}

function closeModalEl(el) {
  if (!el) return;
  el.classList.add('hidden');
  if (!document.querySelector('.modal:not(.hidden)')) {
    document.body.classList.remove('modal-open');
  }
  const prev = __modalFocusStack.pop();
  if (prev && document.contains(prev)) {
    try { prev.focus(); } catch (e) { }
  }
}

// ===================================================================
// 四、取得当前「最上层」打开的 modal（按 z-index + DOM 顺序）
// ===================================================================
function getTopModal() {
  const list = Array.from(document.querySelectorAll('.modal:not(.hidden)'));
  if (!list.length) return null;
  return list.reduce((top, cur) => {
    const zTop = parseInt(getComputedStyle(top).zIndex || '0', 10);
    const zCur = parseInt(getComputedStyle(cur).zIndex || '0', 10);
    if (zCur > zTop) return cur;
    if (zCur === zTop) {
      // 同 z-index：DOM 顺序在后的在上
      return (top.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING) ? cur : top;
    }
    return top;
  });
}

// ===================================================================
// 五、设置弹窗
// ===================================================================
function openSettings() {
  const m = document.getElementById('settingsModal');
  if (!m) { console.error('#settingsModal 不存在'); return; }
  if (!m.innerHTML.trim() && window.__PARTIAL_settingsModal) {
    m.innerHTML = window.__PARTIAL_settingsModal;
  }
  openModalEl(m);
}

function closeSettings() {
  closeModalEl(document.getElementById('settingsModal'));
}

// ===================================================================
// 六、统计弹窗
// ===================================================================
function openStats() {
  const m = document.getElementById('statsModal');
  if (!m) { console.error('#statsModal 不存在'); return; }
  if (!m.innerHTML.trim() && window.__PARTIAL_statsModal) {
    m.innerHTML = window.__PARTIAL_statsModal;
  }
  openModalEl(m);
  if (typeof renderChart === 'function') {
    try { renderChart(); }
    catch (e) { console.error('renderChart 失败：', e); }
  }
  if (typeof renderHistory === 'function') {
    try { renderHistory(); }
    catch (e) { console.error('renderHistory 失败：', e); }
  }
}

function closeStats() {
  closeModalEl(document.getElementById('statsModal'));
}

// ===================================================================
// 七、全局事件绑定
// ===================================================================
function bindGlobalEvents() {
  // 1. 点击 modal 遮罩层（灰底）关闭对应弹窗
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function (e) {
      if (e.target !== modal) return;   // 点在弹窗内部，忽略

      if (modal.id === 'modal') { closeModal(); return; }
      if (modal.id === 'settingsModal') closeSettings();
      else if (modal.id === 'statsModal') closeStats();
      else if (modal.id === 'dictModal') closeDict();
      else modal.classList.add('hidden');
    });
  });

  // 2. ESC 关闭当前最上层 modal
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const top = getTopModal();
    if (!top) return;
    if (top.id === 'modal') closeModal();
    else if (top.id === 'settingsModal') closeSettings();
    else if (top.id === 'statsModal') closeStats();
    else if (top.id === 'dictModal') closeDict();
    else top.classList.add('hidden');
  });

  // 3. Tab 焦点陷阱：把焦点锁在最上层 modal 内
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
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

  // 4. 点击 data-ops 面板外部时收起（仅影响 .data-ops，不影响 modal）
  document.addEventListener('click', function (e) {
    const ops = document.querySelector('.data-ops');
    if (!ops) return;
    if (ops.contains(e.target)) return;
    if (document.activeElement === ops) ops.blur();
  });
}

// ===================================================================
// 八、安全调用
// ===================================================================
function safeCall(name) {
  const fn = window[name];
  if (typeof fn === 'function') {
    try { fn(); }
    catch (e) { console.error('调用 ' + name + ' 失败：', e); }
  } else {
    console.warn('[main.js] 跳过未定义函数：' + name);
  }
}

// ===================================================================
// 九、应用初始化
// ===================================================================
function initApp() {
  safeCall('loadData');
  safeCall('loadDedupe');
  safeCall('loadCollapseState');
  safeCall('loadLangSelSetting');

  safeCall('applyCollapseState');

  safeCall('renderChapterList');
  safeCall('renderWords');
  safeCall('updateStats');

  safeCall('bindGlobalEvents');

  console.log('[单词精灵] 初始化完成');
}

// ===================================================================
// 十、启动
// ===================================================================
(function boot() {
  document.body.classList.add('preload');

  try { injectPartials(); }
  catch (e) { console.error('注入弹窗 HTML 失败：', e); }

  try { initApp(); }
  catch (e) {
    console.error('应用初始化失败：', e);
    if (typeof toast === 'function') {
      toast('应用初始化失败：' + (e && e.message ? e.message : e));
    }
  }

  // 双 rAF：等浏览器完成一次渲染后再恢复过渡动画
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('preload');
    });
  });
})();