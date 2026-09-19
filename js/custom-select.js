/* ===================================================================
 * js/custom-select.js — 自定义下拉组件（替代原生 <select>）
 *
 *   浮层永远贴在编辑框下方，不再受浏览器原生控件坐标错位影响。
 *
 *   用法：
 *     <div class="custom-select" id="xxx" data-value="0">
 *       <button type="button" class="custom-select-btn" onclick="toggleCustomSelect('xxx')">
 *         <span class="custom-select-label">English</span>
 *         <span class="custom-select-arrow">▾</span>
 *       </button>
 *       <div class="custom-select-panel hidden">
 *         <div class="custom-select-option" data-value="0" onclick="pickCustomSelect('xxx','0')">English</div>
 *         <div class="custom-select-option" data-value="1" onclick="pickCustomSelect('xxx','1')">汉语</div>
 *       </div>
 *     </div>
 *
 *   读取值：
 *     getCustomSelectValue('xxx')          // → "0" / "1" / ...
 *     getCustomSelectValue('xxx', '0')     // 带默认值
 *
 *   设置值：
 *     setCustomSelectValue('xxx', '1')     // 同步 label 与选项选中态
 * =================================================================== */

/**
 * 关闭所有已展开的 custom-select
 * @param {string} [exceptId] 例外：不关闭这个 id 的下拉
 */
function _closeAllCustomSelects(exceptId) {
  document.querySelectorAll(".custom-select.open").forEach((el) => {
    if (exceptId && el.id === exceptId) return;
    el.classList.remove("open");
    const panel = el.querySelector(".custom-select-panel");
    if (panel) panel.classList.add("hidden");
  });
}

/**
 * 切换某个 custom-select 的展开/收起
 * @param {string} id
 */
function toggleCustomSelect(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const panel = el.querySelector(".custom-select-panel");
  if (!panel) return;

  const isOpen = el.classList.contains("open");
  _closeAllCustomSelects(id); // 先关别的
  if (isOpen) {
    el.classList.remove("open");
    panel.classList.add("hidden");
  } else {
    el.classList.add("open");
    panel.classList.remove("hidden");
  }
}

/**
 * 选中某个选项
 * @param {string} id
 * @param {string|number} value
 */
function pickCustomSelect(id, value) {
  setCustomSelectValue(id, value);
  _closeAllCustomSelects();
}

/**
 * 读取当前值
 * @param {string} id
 * @param {string} [defaultValue]
 * @returns {string}
 */
function getCustomSelectValue(id, defaultValue) {
  const el = document.getElementById(id);
  if (!el) return defaultValue;
  const v = el.dataset.value;
  return v === undefined || v === "" ? defaultValue : v;
}

/**
 * 设置当前值（同步 label 文字 + 选项选中态）
 * @param {string} id
 * @param {string|number} value
 */
function setCustomSelectValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const panel = el.querySelector(".custom-select-panel");
  if (!panel) return;

  el.dataset.value = String(value);

  const opts = panel.querySelectorAll(".custom-select-option");
  let labelText = "";
  opts.forEach((opt) => {
    const match = opt.dataset.value === String(value);
    opt.classList.toggle("selected", match);
    if (match) labelText = opt.textContent;
  });

  const label = el.querySelector(".custom-select-label");
  if (label) label.textContent = labelText;
}

/* ===== 全局关闭：点外部 / Esc ===== */
(function initCustomSelectGlobalHandlers() {
  if (window.__customSelectBound) return;
  window.__customSelectBound = true;

  document.addEventListener("click", function (e) {
    const inside = e.target.closest(".custom-select");
    if (!inside) _closeAllCustomSelects();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _closeAllCustomSelects();
  });
})();
