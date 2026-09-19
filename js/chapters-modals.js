/* ===================================================================
 * js/chapters-modals.js - 章节相关弹窗
 *   - 统一新增弹窗：左侧图标 Tab 切换「新增章节 / 新增单词」
 *   - 右上角 √ 按钮 = 保存当前 Tab
 *   - 修改章节（仅名称）
 *
 * 依赖：
 *   - chapters.js : addChapter, renderChapterList
 *   - words.js    : addWord, renderWords
 *   - main.js     : openModal, closeModal
 *   - core.js     : $, toast, esc, custom-select 相关
 * =================================================================== */

/* ===== 当前激活的 Tab（"chapter" | "word"） ===== */
let _addActiveTab = "chapter";

/* ===== Tab 切换：左侧图标 Tab ===== */
function switchAddTab(tab) {
  const tabChapter = $("addTabChapter");
  const tabWord = $("addTabWord");
  const paneChapter = $("addPaneChapter");
  const paneWord = $("addPaneWord");
  if (!tabChapter || !tabWord || !paneChapter || !paneWord) return;

  const isChapter = tab === "chapter";
  _addActiveTab = isChapter ? "chapter" : "word";

  tabChapter.classList.toggle("active", isChapter);
  tabWord.classList.toggle("active", !isChapter);
  paneChapter.classList.toggle("hidden", !isChapter);
  paneWord.classList.toggle("hidden", isChapter);

  // 同步弹窗标题
  const titleEl = document.querySelector("#modalBody .modal-head h2");
  if (titleEl) {
    titleEl.textContent = isChapter ? "新增章节" : "新增单词";
  }

  if (isChapter) {
    const t = $("addChapterName");
    if (t) t.focus();
  } else {
    const t = $("addWordText");
    if (t) t.focus();
  }
}

/* ===== 右上角 √：保存当前 Tab ===== */
function onAddModalSave() {
  if (_addActiveTab === "chapter") {
    addChapterFromModal();
  } else {
    addWordFromModal();
  }
}

/* ===== 辅助：生成"所属章节"的 custom-select HTML ===== */
function _chapterSelectHtml(id, currentIndex) {
  const cur = String(
    typeof currentIndex === "number" && currentIndex >= 0 ? currentIndex : 0,
  );
  const optionsHtml = data.chapters
    .map((c, i) => {
      const sel = String(i) === cur;
      return (
        '<div class="custom-select-option' +
        (sel ? " selected" : "") +
        '" data-value="' +
        i +
        '" onclick="pickCustomSelect(\'' +
        id +
        "','" +
        i +
        "')\">" +
        esc(c.name) +
        "</div>"
      );
    })
    .join("");

  const curName = data.chapters[currentIndex]
    ? data.chapters[currentIndex].name
    : "请选择章节";

  return (
    '<div class="custom-select" id="' +
    id +
    '" data-value="' +
    cur +
    '">' +
    '<button type="button" class="custom-select-btn" onclick="toggleCustomSelect(\'' +
    id +
    "')\">" +
    '<span class="custom-select-label">' +
    esc(curName) +
    "</span>" +
    '<span class="custom-select-arrow">▾</span>' +
    "</button>" +
    '<div class="custom-select-panel hidden">' +
    optionsHtml +
    "</div>" +
    "</div>"
  );
}

// ===== 统一新增弹窗：顶部文字 Tab 切换 =====
function openAddModal() {
  _addActiveTab = "chapter"; // 默认章节

  const currentIdx =
    typeof currentChapter === "number" && currentChapter >= 0
      ? currentChapter
      : 0;

  // ★ 顶部 Tab 头（和设置弹窗一致的风格），右侧放 √ + ✕
  //   注意：openModal() 会自动生成 .modal-head，
  //   我们在 openModal 之后覆盖它，见下方。
  const bodyHtml =
    '<div class="add-layout">' +
    // 内容区
    '<div class="add-main">' +
    // 章节 pane
    '<div class="add-pane" id="addPaneChapter">' +
    "<label>章节名称</label>" +
    '<input id="addChapterName" class="input" placeholder="输入章节名称">' +
    "</div>" +
    // 单词 pane
    '<div class="add-pane hidden" id="addPaneWord">' +
    "<label>所属章节</label>" +
    _chapterSelectHtml("addWordChapter", currentIdx) +
    "<label>单词</label>" +
    '<input id="addWordText" class="input" placeholder="单词">' +
    "<label>释义</label>" +
    '<input id="addWordMeaning" class="input" placeholder="释义">' +
    "</div>" +
    "</div>" +
    "</div>";

  openModal("新增章节", bodyHtml);

  // 覆盖 #modalBody 里的 .modal-head，把关闭按钮换成"√ + ✕"
  const body = document.getElementById("modalBody");
  if (body) {
    const oldHead = body.querySelector(".modal-head");
    if (oldHead) {
      oldHead.innerHTML =
        '<div class="settings-tabs add-head-tabs" style="flex:1;">' +
        '<button type="button" class="settings-tab active" id="addTabChapter" onclick="switchAddTab(\'chapter\')">📂 新增章节</button>' +
        '<button type="button" class="settings-tab" id="addTabWord" onclick="switchAddTab(\'word\')">📝 新增单词</button>' +
        "</div>" +
        '<div style="display:flex;gap:6px;margin-left:auto;padding-left:16px;flex-shrink:0;">' +
        '<button type="button" class="modal-save" onclick="onAddModalSave()" title="保存">√</button>' +
        '<button type="button" class="modal-close" onclick="closeModal()" title="关闭">✕</button>' +
        "</div>";
    }
  }

  const t = $("addChapterName");
  if (t) t.focus();
}

function refreshAddWordSelect() {
  const el = $("addWordChapter");
  if (!el) return;
  const currentIdx =
    typeof currentChapter === "number" && currentChapter >= 0
      ? currentChapter
      : 0;
  const optionsHtml = data.chapters
    .map((c, i) => {
      const sel = String(i) === String(currentIdx);
      return (
        '<div class="custom-select-option' +
        (sel ? " selected" : "") +
        '" data-value="' +
        i +
        "\" onclick=\"pickCustomSelect('addWordChapter','" +
        i +
        "')\">" +
        esc(c.name) +
        "</div>"
      );
    })
    .join("");
  const panel = el.querySelector(".custom-select-panel");
  if (panel) panel.innerHTML = optionsHtml;
  setCustomSelectValue("addWordChapter", String(currentIdx));
}

/* ===== 保存：新增章节 ===== */
function addChapterFromModal() {
  const inp = $("addChapterName");
  const name = inp ? inp.value.trim() : "";

  if (!name) {
    toast("请输入章节名称");
    if (inp) inp.focus();
    return;
  }
  if (name.length > 30) {
    toast("章节名称不能超过 30 个字符");
    if (inp) inp.focus();
    return;
  }
  if (data.chapters.some((c) => c.name === name)) {
    toast("章节「" + name + "」已存在");
    if (inp) inp.focus();
    return;
  }

  try {
    addChapter(name); // ★ 不再传 dictLang
    if (inp) inp.value = "";
    refreshAddWordSelect();
    if (inp) inp.focus();
    toast("✅ 已添加章节：" + name);
  } catch (e) {
    console.error("新增章节失败：", e);
    toast("❌ 添加失败：" + (e && e.message ? e.message : e));
  }
}

/* ===== 保存：新增单词 ===== */
function addWordFromModal() {
  const t = $("addWordText");
  const m = $("addWordMeaning");
  const text = t ? t.value.trim() : "";
  const meaning = m ? m.value.trim() : "";

  if (!text) {
    toast("请输入单词");
    if (t) t.focus();
    return;
  }
  if (text.length > 50) {
    toast("单词/词语不能超过 50 个字符");
    if (t) t.focus();
    return;
  }

  const ciStr = getCustomSelectValue("addWordChapter", "0");
  const ci = parseInt(ciStr, 10);
  if (Number.isNaN(ci) || ci < 0 || ci >= data.chapters.length) {
    toast("请选择所属章节");
    return;
  }
  if (data.chapters[ci].words.some((w) => w.text === text)) {
    toast("单词「" + text + "」已存在");
    if (t) t.focus();
    return;
  }

  try {
    addWord(text, meaning, ci);
    if (t) t.value = "";
    if (m) m.value = "";
    if (t) t.focus();
    toast("✅ 已添加单词：" + text);
  } catch (e) {
    console.error("新增单词失败：", e);
    toast("❌ 添加失败：" + (e && e.message ? e.message : e));
  }
}

// ===== 修改章节 =====
function renameChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return;

  openFormModal({
    title: "修改章节",
    body:
      "<label>章节名称</label>" +
      '<input id="mInput" class="input" value="' +
      esc(ch.name) +
      '" placeholder="章节名称">',
    saveTitle: "保存",
    cancelTitle: "取消",
    onSave: function () {
      return doRenameChapter(ci);
    },
  });
}

function doRenameChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return false;

  const oldName = ch.name;
  const newName = $("mInput").value.trim();
  if (!newName) {
    toast("名称不能为空");
    return false;
  }
  const dup = data.chapters.findIndex((c, i) => c.name === newName && i !== ci);
  if (dup >= 0) {
    toast("已存在同名章节");
    return false;
  }

  if (listVisibleSet.has(oldName)) {
    listVisibleSet.delete(oldName);
    listVisibleSet.add(newName);
  }
  ch.name = newName;

  try {
    saveData();
    renderChapterList();
    renderWords();
    toast("✅ 已修改章节：" + newName);
    return true;
  } catch (e) {
    console.error("修改章节失败：", e);
    toast("❌ 修改失败：" + (e && e.message ? e.message : e));
    return false;
  }
}
