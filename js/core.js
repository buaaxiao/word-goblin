/* ===================================================================
 * js/core.js - 基础工具 / 主题 / 折叠 / 搜索
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */
'use strict';

const THEME_KEY = 'wordDictation.theme.v1';

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
      document.body.classList.add('dark');
      updateThemeUI('dark');
    } else {
      updateThemeUI('light');
    }
    syncThemeModeRadios(getCurrentThemeMode());
  } catch (e) {}
}
function getCurrentThemeMode() { return document.body.classList.contains('dark') ? 'dark' : 'light'; }
function updateThemeUI(theme) {
  const icon = document.getElementById('themeIcon');
  const text = document.getElementById('themeText');
  if (theme === 'dark') {
    if (icon) icon.textContent = '🌙';
    if (text) text.textContent = '深色';
  } else {
    if (icon) icon.textContent = '☀️';
    if (text) text.textContent = '浅色';
  }
}
// 设置弹窗：系统设置（主题颜色模式）
function setThemeMode(mode) {
  const isDark = mode === 'dark';
  document.body.classList.toggle('dark', isDark);
  try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch (e) {}
  updateThemeUI(isDark ? 'dark' : 'light');
  const meta = document.getElementById('themeColorMeta');
  if (meta) meta.setAttribute('content', isDark ? '#1f2937' : '#4a7cff');
  syncThemeModeRadios(isDark ? 'dark' : 'light');
}
function syncThemeModeRadios(mode) {
  document.querySelectorAll('input[name=themeMode]').forEach(r => { r.checked = r.value === mode; });
}
function openSettings() {
  syncThemeModeRadios(getCurrentThemeMode());
  const m = $('settingsModal');
  if (m) m.classList.remove('hidden');
}
function closeSettings() {
  const m = $('settingsModal');
  if (m) m.classList.add('hidden');
}

// ===== 默认报词方式：以设置界面的“报词方式”设置为准 =====
const LANGSEL_KEY = 'wordDictation.langSel.v1';
function getDefaultDictLang() {
  try {
    const saved = localStorage.getItem(LANGSEL_KEY);
    if (saved === '1') return 1;
    if (saved === '0') return 0;
  } catch (e) {}
  const el = $('langSel');
  return (el && el.value === '1') ? 1 : 0;
}
function saveLangSelSetting() {
  const el = $('langSel');
  try { localStorage.setItem(LANGSEL_KEY, el && el.value === '1' ? '1' : '0'); } catch (e) {}
}
function loadLangSelSetting() {
  try {
    const saved = localStorage.getItem(LANGSEL_KEY);
    const el = $('langSel');
    if (el && (saved === '1' || saved === '0')) el.value = saved;
  } catch (e) {}
}

const COLLAPSE_KEY = 'wordDictation.collapse.v4';
let collapseState = { chapter: false, word: true };

function loadCollapseState() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) collapseState = Object.assign(collapseState, JSON.parse(raw));
  } catch (e) {}
}
function saveCollapseState() {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapseState)); } catch (e) {}
}
function applyCollapseState() {
  applyOneCollapse('chapterHeader', 'chapterBody', 'chapterArrow', '📂', '📁', collapseState.chapter);
  applyOneCollapse('wordHeader', 'wordBody', 'wordArrow', '📖', '📕', collapseState.word);
}
function applyOneCollapse(headerId, bodyId, arrowId, iconOpen, iconClosed, collapsed) {
  const header = $(headerId);
  const body = $(bodyId);
  const arrow = $(arrowId);
  if (!header || !body) return;
  if (collapsed) {
    header.classList.add('collapsed');
    body.classList.add('collapsed');
    if (arrow) arrow.textContent = iconClosed;
  } else {
    header.classList.remove('collapsed');
    body.classList.remove('collapsed');
    if (arrow) arrow.textContent = iconOpen;
  }
}
function toggleSection(which) {
  if (which === 'chapter') collapseState.chapter = !collapseState.chapter;
  else if (which === 'word') collapseState.word = !collapseState.word;
  saveCollapseState();
  applyCollapseState();
}

// ===== 列表显示模式：章节 / 单词各自独立的 编辑·查看 =====
const LIST_MODE_KEY = 'wordDictation.listMode.v1';
let chapterMode = 'edit';
let wordMode = 'edit';
function loadListMode() {
  try {
    const raw = localStorage.getItem(LIST_MODE_KEY);
    if (!raw) return;
    let v;
    try { v = JSON.parse(raw); } catch (e) { v = raw; }
    if (typeof v === 'string') { // 兼容旧版本：全局值应用到两个列表
      const m = v === 'view' ? 'view' : 'edit';
      chapterMode = m;
      wordMode = m;
    } else if (v && typeof v === 'object') {
      chapterMode = v.chapter === 'view' ? 'view' : 'edit';
      wordMode = v.word === 'view' ? 'view' : 'edit';
    }
  } catch (e) {}
}
function saveListMode() {
  try { localStorage.setItem(LIST_MODE_KEY, JSON.stringify({ chapter: chapterMode, word: wordMode })); } catch (e) {}
}
function applyModesUI() {
  const cb = $('modeBtnChapter'), wb = $('modeBtnWord');
  if (cb) cb.textContent = chapterMode === 'view' ? '✏️ 编辑' : '👁 查看';
  if (wb) wb.textContent = wordMode === 'view' ? '✏️ 编辑' : '👁 查看';
  const chBody = $('chapterBody');
  if (chBody) chBody.classList.toggle('list-view', chapterMode === 'view');
  const wBody = $('wordBody');
  if (wBody) wBody.classList.toggle('list-view', wordMode === 'view');
}
// 章节列表名旁切换按钮：仅切换章节列表模式（同时展开章节列表）
function toggleChapterMode() {
  chapterMode = chapterMode === 'edit' ? 'view' : 'edit';
  saveListMode();
  applyModesUI();
  collapseState.chapter = false;
  saveCollapseState();
  applyCollapseState();
  renderChapterList();
}
// 单词列表名旁切换按钮：仅切换单词列表模式（同时展开单词列表）
function toggleWordMode() {
  wordMode = wordMode === 'edit' ? 'view' : 'edit';
  saveListMode();
  applyModesUI();
  collapseState.word = false;
  saveCollapseState();
  applyCollapseState();
  renderWords();
}

let chapterSearchQuery = '';
let wordSearchQuery = '';

function onChapterSearch() {
  const inp = $('chapterSearch');
  chapterSearchQuery = inp.value.trim();
  const wrap = $('chapterSearchWrap');
  if (wrap) wrap.classList.toggle('has-text', chapterSearchQuery.length > 0);
  renderChapterList();
}
function clearChapterSearch(e) {
  if (e) e.stopPropagation();
  const inp = $('chapterSearch');
  if (inp) inp.value = '';
  chapterSearchQuery = '';
  const wrap = $('chapterSearchWrap');
  if (wrap) wrap.classList.remove('has-text');
  renderChapterList();
}
function onWordSearch() {
  const inp = $('wordSearch');
  wordSearchQuery = inp.value.trim();
  const wrap = $('wordSearchWrap');
  if (wrap) wrap.classList.toggle('has-text', wordSearchQuery.length > 0);
  renderWords();
}
function clearWordSearch(e) {
  if (e) e.stopPropagation();
  const inp = $('wordSearch');
  if (inp) inp.value = '';
  wordSearchQuery = '';
  const wrap = $('wordSearchWrap');
  if (wrap) wrap.classList.remove('has-text');
  renderWords();
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlightText(text, query) {
  if (!query) return esc(text);
  const safe = esc(text);
  const q = esc(query);
  try {
    const re = new RegExp('(' + escapeRegex(q) + ')', 'gi');
    return safe.replace(re, '<mark class="hl">$1</mark>');
  } catch (e) {
    return safe;
  }
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function nowStr() { const d = new Date(); return todayStr() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function avg(w) { return w.scoreCount > 0 ? (w.scoreSum / w.scoreCount).toFixed(1) : '0.0'; }
function formatDur(s) {
  const m = Math.floor(s / 60), ss = s % 60;
  return m > 0 ? m + '分' + ss + '秒' : ss + '秒';
}

function $(id) { return document.getElementById(id); }
function toast(msg) {
  let t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function openModal(title, bodyHtml) {
  $('modalBody').innerHTML = '<div class="modal-head"><h2>' + esc(title) + '</h2><button class="modal-close" onclick="closeModal()" title="关闭">✕</button></div>' + bodyHtml;
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }
