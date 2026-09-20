/* ===================================================================
 * js/modal-actions.js — 统一弹窗（√ 保存/确定 + ✕ 关闭/取消）
 *
 *   三种类型：
 *     openFormModal({ title, body, onSave, onCancel, saveDanger })
 *     openConfirmModal({ title, body, onOk, onCancel, danger })
 *     openInfoModal({ title, body })
 *
 *   行为：
 *     - 右上角永远 [√] [✕]
 *     - √ 触发 onSave / onOk（如果返回 false，不关弹窗）
 *     - ✕ 触发 onCancel（然后关弹窗）
 *     - Esc = ✕
 *     - Enter = √
 *     - 弹窗内不再有底部"确定/取消"按钮
 *
 *   依赖：main.js 的 openModal / closeModal / openModalEl
 * =================================================================== */

(function () {
  // ===== 生成 head HTML（标题 + √ + ✕）=====
  function _buildHead(title, opts) {
    opts = opts || {};
    const saveLabel = opts.saveLabel || "√";
    const saveClass = opts.danger
      ? "modal-save modal-save-danger"
      : "modal-save";
    const saveTitle = opts.saveTitle || "保存";
    const cancelTitle = opts.cancelTitle || "取消";

    return (
      '<div class="modal-head">' +
      "<h2>" +
      esc(title) +
      "</h2>" +
      '<div style="display:flex;gap:6px;">' +
      '<button type="button" class="' +
      saveClass +
      '" title="' +
      saveTitle +
      '">' +
      saveLabel +
      "</button>" +
      '<button type="button" class="modal-close" title="' +
      cancelTitle +
      '">✕</button>' +
      "</div>" +
      "</div>"
    );
  }

  // ===== 通用：替换 #modalBody 的 head + 绑事件 =====
  function _wireModal(title, body, opts, onSave, onCancel) {
    // 1. 打开弹窗（body 里不含 head）
    //    openModal 会拼一个默认 head，我们随后替换掉
    openModal(title, body);

    // 2. 替换 head + 绑事件
    const bodyEl = document.getElementById("modalBody");
    if (!bodyEl) return;
    const oldHead = bodyEl.querySelector(".modal-head");
    if (!oldHead) return;

    oldHead.outerHTML = _buildHead(title, opts);

    const saveBtn = bodyEl.querySelector(".modal-save");
    const closeBtn = bodyEl.querySelector(".modal-close");

    if (saveBtn) {
      saveBtn.onclick = function () {
        // onSave 返回 false → 不关弹窗
        const r = typeof onSave === "function" ? onSave() : true;
        if (r === false) return;
        closeModal();
      };
    }
    if (closeBtn) {
      closeBtn.onclick = function () {
        closeModal();
        if (typeof onCancel === "function") onCancel();
      };
    }
  }

  // ===== Enter / Esc 快捷键（只在弹窗打开时生效）=====
  function _isAnyModalOpen() {
    return !!document.querySelector(".modal:not(.hidden)");
  }

  document.addEventListener(
    "keydown",
    function (e) {
      if (!_isAnyModalOpen()) return;
      const bodyEl = document.getElementById("modalBody");
      if (!bodyEl) return;

      if (e.key === "Enter") {
        // 不要抢 textarea / 输入法组合的 Enter
        const t = e.target;
        if (t && t.tagName === "TEXTAREA") return;
        if (e.isComposing) return;

        const saveBtn = bodyEl.querySelector(".modal-save");
        if (saveBtn) {
          e.preventDefault();
          saveBtn.click();
        }
      } else if (e.key === "Escape") {
        // main.js 已有全局 Esc，这里不重复处理
      }
    },
    true,
  ); // capture 优先，避免输入框吃掉

  // ===== 对外 API =====
  window.openFormModal = function (opts) {
    opts = opts || {};
    _wireModal(
      opts.title || "",
      opts.body || "",
      {
        saveLabel: opts.saveLabel,
        saveTitle: opts.saveTitle || "保存",
        cancelTitle: opts.cancelTitle || "取消",
        danger: opts.danger,
      },
      opts.onSave,
      opts.onCancel,
    );
    if (typeof opts.onOpened === "function") {
      // openModal 之后，DOM 已就绪
      setTimeout(function () {
        opts.onOpened();
      }, 0);
    }
  };

  window.openConfirmModal = function (opts) {
    opts = opts || {};
    _wireModal(
      opts.title || "提示",
      opts.body || "",
      {
        saveLabel: "√",
        saveTitle: opts.okTitle || "确定",
        cancelTitle: opts.cancelTitle || "取消",
        danger: opts.danger,
      },
      opts.onOk,
      opts.onCancel,
    );

    if (typeof opts.onOpened === "function") {
      setTimeout(opts.onOpened, 0);
    }
  };

  window.openInfoModal = function (opts) {
    opts = opts || {};
    _wireModal(
      opts.title || "提示",
      opts.body || "",
      {
        saveLabel: "√",
        saveTitle: opts.okTitle || "确定",
        cancelTitle: "关闭",
        danger: opts.danger,
      },
      opts.onOk, // 可选，没传就只是关闭
      opts.onCancel,
    );
  };
})();
