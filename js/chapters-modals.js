/* ===================================================================
 * js/chapters-modals.js - 章节相关弹窗
 *   - 统一新增弹窗：上段新增章节、下段新增单词
 *   - 修改章节（名称 + 报词方式，含云端报词方式加载）
 *
 * 依赖：
 *   - chapters.js : addChapter, renderChapterList
 *   - words.js    : addWord, renderWords
 *   - main.js     : openModal, closeModal
 *   - core.js     : $, toast, esc
 * =================================================================== */

// ===== 统一新增弹窗：上段新增章节、下段新增单词 =====
function openAddModal() {
  const chOptions = data.chapters
    .map(
      (c, i) =>
        '<option value="' +
        i +
        '"' +
        (i === currentChapter ? " selected" : "") +
        ">" +
        esc(c.name) +
        "</option>",
    )
    .join("");
  openModal(
    "新增",
    '<div class="add-block">' +
      '<div class="add-title">📂 新增章节</div>' +
      '<div class="add-inline">' +
      '<input id="addChapterName" class="input" placeholder="输入章节名称">' +
      '<button class="primary" onclick="addChapterFromModal()">添加</button>' +
      "</div>" +
      "<label>报词方式</label>" +
      '<select id="addChapterLang">' +
      '<option value="0"' +
      (getDefaultDictLang() === 1 ? "" : " selected") +
      ">English</option>" +
      '<option value="1"' +
      (getDefaultDictLang() === 1 ? " selected" : "") +
      ">汉语</option>" +
      "</select>" +
      "</div>" +
      '<div class="add-divider"></div>' +
      '<div class="add-block">' +
      '<div class="add-title">📝 新增单词</div>' +
      "<label>所属章节</label>" +
      '<select id="addWordChapter">' +
      chOptions +
      "</select>" +
      "<label>单词/词语</label>" +
      '<input id="addWordText" class="input" placeholder="单词/词语">' +
      "<label>中文意思（英语单词填，可留空）</label>" +
      '<input id="addWordMeaning" class="input" placeholder="中文意思">' +
      '<button class="primary" style="width:100%;margin-top:2px" onclick="addWordFromModal()">添加单词</button>' +
      "</div>",
  );
  const t = $("addChapterName");
  if (t) t.focus();
}

function refreshAddWordSelect() {
  const sel = $("addWordChapter");
  if (!sel) return;
  const chOptions = data.chapters
    .map(
      (c, i) =>
        '<option value="' +
        i +
        '"' +
        (i === currentChapter ? " selected" : "") +
        ">" +
        esc(c.name) +
        "</option>",
    )
    .join("");
  sel.innerHTML = chOptions;
}

function addChapterFromModal() {
  const inp = $("addChapterName");
  const langEl = $("addChapterLang");
  addChapter(
    inp ? inp.value : "",
    langEl ? parseInt(langEl.value, 10) : getDefaultDictLang(),
  );
  if (inp && inp.value.trim()) inp.value = "";
  refreshAddWordSelect();
  if (inp) inp.focus();
}

function addWordFromModal() {
  const text = $("addWordText") ? $("addWordText").value : "";
  const meaning = $("addWordMeaning") ? $("addWordMeaning").value : "";
  const sel = $("addWordChapter");
  addWord(text, meaning, sel ? parseInt(sel.value, 10) : NaN);
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
  return fetch("data.json?_=" + Date.now())
    .then((r) => {
      if (!r.ok) throw new Error("fetch");
      return r.json();
    })
    .then((obj) => {
      const m = new Map();
      (obj.chapters || []).forEach((ch) => {
        if (typeof ch.dictLang === "number") m.set(ch.name, ch.dictLang);
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
    const dl = m.has(ch.name) ? m.get(ch.name) : localDl;
    openModal(
      "修改章节",
      "<label>章节名称</label>" +
        '<input id="mInput" class="input" value="' +
        esc(ch.name) +
        '" placeholder="章节名称">' +
        "<label>报词方式</label>" +
        '<select id="mLang">' +
        '<option value="0"' +
        (dl === 1 ? "" : " selected") +
        ">English</option>" +
        '<option value="1"' +
        (dl === 1 ? " selected" : "") +
        ">汉语</option>" +
        "</select>" +
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

  const ml = $("mLang");
  if (ml) ch.dictLang = ml.value === "1" ? 1 : 0;

  // 同步：如果旧名在可见集合里，换成新名
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
