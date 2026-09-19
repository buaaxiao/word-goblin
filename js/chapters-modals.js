/* ===================================================================
 * js/chapters-modals.js - 章节相关弹窗
 *   - 统一新增弹窗：上段新增章节、下段新增单词
 *   - 修改章节（名称 + 报词方式，含云端报词方式加载）
 *
 * 依赖：
 *   - chapters.js : addChapter, renderChapterList
 *   - words.js    : addWord, renderWords
 *   - main.js     : openModal, closeModal
 *   - core.js     : $, toast, esc, custom-select 相关
 * =================================================================== */

/* ===== 辅助：生成报词方式的 custom-select HTML ===== */
function _dictLangSelectHtml(id, currentValue) {
  const v = currentValue === 1 ? "1" : "0";
  const labelText = v === "1" ? "汉语" : "English";
  return (
    '<div class="custom-select" id="' +
    id +
    '" data-value="' +
    v +
    '">' +
    '<button type="button" class="custom-select-btn" onclick="toggleCustomSelect(\'' +
    id +
    "')\">" +
    '<span class="custom-select-label">' +
    labelText +
    "</span>" +
    '<span class="custom-select-arrow">▾</span>' +
    "</button>" +
    '<div class="custom-select-panel hidden">' +
    '<div class="custom-select-option' +
    (v === "1" ? " selected" : "") +
    '" data-value="1" onclick="pickCustomSelect(\'' +
    id +
    "','1')\">汉语</div>" +
    '<div class="custom-select-option' +
    (v === "0" ? " selected" : "") +
    '" data-value="0" onclick="pickCustomSelect(\'' +
    id +
    "','0')\">English</div>" +
    "</div>" +
    "</div>"
  );
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

// ===== 统一新增弹窗：上段新增章节、下段新增单词 =====
function openAddModal() {
  const currentIdx =
    typeof currentChapter === "number" && currentChapter >= 0
      ? currentChapter
      : 0;
  openModal(
    "新增",
    '<div class="add-block">' +
      '<div class="add-title">📂 新增章节</div>' +
      // 输入框独占一行
      '<input id="addChapterName" class="input" placeholder="输入章节名称">' +
      "<label>报词方式</label>" +
      _dictLangSelectHtml("addChapterLang", getDefaultDictLang()) +
      // ★ 添加按钮移到报词方式下方，全宽
      '<button class="primary" style="width:100%;margin-top:8px" onclick="addChapterFromModal()">保存</button>' +
      "</div>" +
      '<div class="add-divider"></div>' +
      '<div class="add-block">' +
      '<div class="add-title">📝 新增单词</div>' +
      "<label>所属章节</label>" +
      _chapterSelectHtml("addWordChapter", currentIdx) +
      "<label>单词</label>" +
      '<input id="addWordText" class="input" placeholder="单词">' +
      "<label>释义</label>" +
      '<input id="addWordMeaning" class="input" placeholder="释义">' +
      '<button class="primary" style="width:100%;margin-top:8px" onclick="addWordFromModal()">保存</button>' +
      "</div>",
  );
  const t = $("addChapterName");
  if (t) t.focus();
}

function refreshAddWordSelect() {
  // 新增章节后，所属章节下拉可能需要更新
  const el = $("addWordChapter");
  if (!el) return;
  const currentIdx =
    typeof currentChapter === "number" && currentChapter >= 0
      ? currentChapter
      : 0;
  const wrap = el.closest(".custom-select") || el;
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

function addChapterFromModal() {
  const inp = $("addChapterName");
  const langVal = getCustomSelectValue("addChapterLang", "0");
  addChapter(inp ? inp.value : "", langVal === "1" ? 1 : 0);
  if (inp && inp.value.trim()) inp.value = "";
  refreshAddWordSelect();
  if (inp) inp.focus();
}

function addWordFromModal() {
  const text = $("addWordText") ? $("addWordText").value : "";
  const meaning = $("addWordMeaning") ? $("addWordMeaning").value : "";
  const ciStr = getCustomSelectValue("addWordChapter", "0");
  const ci = parseInt(ciStr, 10);
  addWord(text, meaning, Number.isNaN(ci) ? NaN : ci);
  const t = $("addWordText"),
    m = $("addWordMeaning");
  if (t) t.value = "";
  if (m) m.value = "";
  if (t) t.focus();
}

// ===== 云端报词方式缓存 =====
let cloudDictLang = null;
function loadCloudDictLang() {
  if (cloudDictLang !== null) return Promise.resolve(cloudDictLang);
  return fetch(getDataUrl())
    .then((r) => {
      if (!r.ok) throw new Error("fetch");
      return r.json();
    })
    .then((obj) => {
      const m = new Map();
      (obj.chapters || []).forEach((ch) => {
        if (ch.id && typeof ch.dictLang === "number") m.set(ch.id, ch.dictLang);
      });
      cloudDictLang = m;
      return m;
    })
    .catch(() => {
      cloudDictLang = new Map();
      return cloudDictLang;
    });
}

// ===== 修改章节 =====
function renameChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return;
  const localDl =
    typeof ch.dictLang === "number" ? ch.dictLang : getDefaultDictLang();

  loadCloudDictLang().then((m) => {
    const dl = ch._id && m.has(ch._id) ? m.get(ch._id) : localDl;
    openModal(
      "修改章节",
      "<label>章节名称</label>" +
        '<input id="mInput" class="input" value="' +
        esc(ch.name) +
        '" placeholder="章节名称">' +
        "<label>报词方式</label>" +
        _dictLangSelectHtml("mLang", dl) +
        '<div class="row"><button onclick="closeModal()">取消</button>' +
        '<button class="primary" onclick="doRenameChapter(' +
        ci +
        ')">确定</button></div>',
    );
  });
}

function doRenameChapter(ci) {
  const ch = data.chapters[ci];
  if (!ch) return;

  const oldName = ch.name;
  const newName = $("mInput").value.trim();
  if (!newName) {
    toast("名称不能为空");
    return;
  }
  const dup = data.chapters.findIndex((c, i) => c.name === newName && i !== ci);
  if (dup >= 0) {
    toast("已存在同名章节");
    return;
  }

  // ★ 从 custom-select 读值
  const langVal = getCustomSelectValue("mLang", "0");
  ch.dictLang = langVal === "1" ? 1 : 0;

  if (listVisibleSet.has(oldName)) {
    listVisibleSet.delete(oldName);
    listVisibleSet.add(newName);
  }
  ch.name = newName;

  saveData();
  renderChapterList();
  renderWords();
  closeModal();
}
