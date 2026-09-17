/* ===================================================================
 * js/dictation.js - 语音与默写引擎
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */

let voiceList = [];
let voicesReady = false;
let lastSpeechError = '';

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const collect = () => {
    try { voiceList = speechSynthesis.getVoices(); } catch (e) { voiceList = []; }
    voicesReady = voiceList.length > 0;
  };
  collect();
  speechSynthesis.onvoiceschanged = collect;
  setTimeout(collect, 200);
  setTimeout(collect, 600);
  setTimeout(collect, 1500);
}

function pickVoice(lang) {
  try {
    if (!voiceList.length) voiceList = speechSynthesis.getVoices();
  } catch (e) { voiceList = []; }
  if (!voiceList.length) return null;
  const norm = s => String(s).replace('_', '-').toLowerCase();
  const base = norm(lang || '').slice(0, 2);
  let best = null, bestScore = 10;
  for (const v of voiceList) {
    const l = norm(v.lang);
    let score;
    if (base && l === norm(lang)) score = 0;
    else if (base && l.indexOf(base) === 0) score = 1;
    else if (v.default) score = 2;
    else score = 3;
    if (!v.localService) score += 0.5;
    if (score < bestScore) { bestScore = score; best = v; }
  }
  return best;
}

function speak(text, lang) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    const doSpeak = () => {
      try { speechSynthesis.resume(); } catch (e) {}

      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(lang);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else {
        u.lang = lang || 'zh-CN';
      }
      u.rate = 0.9;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      u.onend = finish;
      u.onerror = (e) => { lastSpeechError = (e && e.error) || 'unknown'; finish(); };
      setTimeout(finish, Math.max(3000, text.length * 500 + 1500));
      try { speechSynthesis.speak(u); } catch (e) { finish(); }
    };
    if (voicesReady) { doSpeak(); return; }
    let tries = 0;
    const wait = () => {
      try { voiceList = speechSynthesis.getVoices(); voicesReady = voiceList.length > 0; } catch (e) {}
      if (voicesReady || ++tries > 12) { doSpeak(); return; }
      setTimeout(wait, 100);
    };
    wait();
  });
}

function testSpeech() {
  if (!('speechSynthesis' in window)) { toast('当前浏览器不支持语音'); return; }
  try { speechSynthesis.resume(); } catch (e) {}
  const zh = '你好，我是单词精灵，现在测试发音。';
  const u = new SpeechSynthesisUtterance(zh);
  const v = pickVoice('zh-CN');
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'zh-CN'; }
  u.rate = 0.9;
  u.onend = () => toast('发音正常');
  u.onerror = () => toast('发音失败：请检查系统 TTS 中文语音是否已安装启用');
  try { speechSynthesis.speak(u); } catch (e) { toast('发音失败：' + e.message); }
  toast('正在测试发音…');
}

const dict = {
  running: false, paused: false, phase: 'idle',
  items: [], marks: [], idx: 0,
  intervalMs: 12000, repeatCount: 3, repeatIntervalMs: 2000,
  speakChinese: false, mode: 0,
  selectedChapters: [], startTime: 0, resumeResolve: null,
  skipResolve: null, prevResolve: null, replayResolve: null,
  currentRepeat: 0,
};

let timerInterval = null;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
function collectItems() {
  const items = [];
  for (let ci = 0; ci < data.chapters.length; ci++) {
    const ch = data.chapters[ci];
    if (!ch.selected) continue;
    for (let wi = 0; wi < ch.words.length; wi++) {
      const w = ch.words[wi];
      if (dict.mode === 1 && w.wrongCount === 0) continue;
      if (dict.mode === 2) {
        const errorNewer = !!w.lastErrorDate &&
          (w.lastCorrectDate === '' || w.lastErrorDate > w.lastCorrectDate);
        if (!errorNewer) continue;
      }
      items.push({ text: w.text, meaning: w.meaning, ci, wi });
    }
  }
  return items;
}
function noItemsMessage() {
  if (dict.mode === 2) return '没有可播报的单词（所选章节中没有“最后默写错误”的单词）';
  if (dict.mode === 1) return '没有错题可播报（所选章节中暂无标记错误的单词）';
  return '请先在“词库”勾选要默写的章节，并确保章节包含单词';
}
function waitResume() {
  return new Promise(resolve => {
    if (!dict.paused) { resolve(); return; }
    dict.resumeResolve = resolve;
  });
}
function sleep(ms) {
  return new Promise(resolve => {
    const end = Date.now() + ms;
    (function loop() {
      if (!dict.running) { resolve(); return; }
      if (dict.paused) { waitResume().then(loop); return; }
      if (Date.now() >= end) { resolve(); return; }
      setTimeout(loop, Math.min(200, end - Date.now()));
    })();
  });
}

function waitOrAction(timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      dict.skipResolve = null;
      dict.prevResolve = null;
      dict.replayResolve = null;
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ action: 'timeout' });
    }, timeoutMs);

    dict.skipResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ action: 'next' });
    };
    dict.prevResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ action: 'prev' });
    };
    dict.replayResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ action: 'replay' });
    };
  });
}

function startDictation() {
  dict.intervalMs = (parseInt($('intervalSec').value, 10) || 0) * 1000;
  dict.repeatCount = Math.max(1, parseInt($('repeatCount').value, 10) || 3);
  dict.repeatIntervalMs = (parseInt($('repeatIntervalSec').value, 10) || 0) * 1000;
  // 报词方式默认取「第一个选中章节」的设置；多章节时给出提示
  const selChs = data.chapters.filter(c => c.selected);
  if (!selChs.length) { showAlert('未选中任何章节，不能开始默写'); return; } // 无选中章节不可开始默写
  const firstCh = selChs[0];
  let dl = getDefaultDictLang(); // 默认按设置界面报词方式
  if (firstCh) {
    dl = (typeof firstCh.dictLang === 'number') ? firstCh.dictLang : getDefaultDictLang(); // 章节无 dictLang 时按设置界面默认
    $('langSel').value = String(dl);
  }
  dict.speakChinese = $('langSel').value === '1';
  dict.mode = parseInt($('modeSel').value, 10) || 0;
  dict.selectedChapters = selChs.map(c => c.name);
  const hint = $('dictLangHint');
  if (hint) {
    if (selChs.length > 1 && firstCh) {
      hint.textContent = '已选择 ' + selChs.length + ' 个章节，将按第一个章节「' + firstCh.name + '」的报词方式：' + (dl === 1 ? '汉语' : 'English');
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }

  const items = collectItems();
  if (!items.length) { toast(noItemsMessage()); return; }

  shuffle(items);
  dict.items = items;
  dict.marks = items.map(() => '');
  dict.idx = 0;
  dict.running = true;
  dict.paused = false;
  dict.startTime = Date.now();
  dict.skipResolve = null;
  dict.prevResolve = null;
  dict.replayResolve = null;
  showPhase('playing');
  startTimer();
  runDictation();
}

// 顶部快捷“开始默写”：弹出默写弹窗并立即启动；未选中任何章节时阻止弹窗
function startDictQuick() {
  const selChs = data.chapters.filter(c => c.selected);
  if (!selChs.length) { showAlert('未选中任何章节，不能开始默写'); return; } // 无选中章节不弹默写对话框
  openDict();
  setTimeout(function () { startDictation(); }, 350);
}

// 打开默写弹窗
function openDict() {
  const m = $('dictModal');
  if (m) m.classList.remove('hidden');
}

// 关闭默写弹窗（若正在默写则先停止）
function closeDict() {
  stopDictation();
  const m = $('dictModal');
  if (m) m.classList.add('hidden');
}

async function runDictation() {
  const items = dict.items;
  let i = 0;
  while (i < items.length && dict.running) {
    if (dict.paused) await waitResume();
    if (!dict.running) return;

    dict.idx = i;
    const it = items[i];
    const spoken = (dict.speakChinese && it.meaning) ? it.meaning : it.text;
    const lang = /[一-鿿]/.test(spoken) ? 'zh-CN' : 'en-US';
    setCurrentWord(it.text);
    setProgress(i, items.length);
    updateNavButtons(i, items.length);

    let skipCurrent = false;
    for (let r = 0; r < dict.repeatCount; r++) {
      if (!dict.running) return;
      if (dict.paused) await waitResume();
      if (!dict.running) return;

      dict.currentRepeat = r;
      const speechPromise = speak(spoken, lang);
      const estimatedMs = Math.max(3000, spoken.length * 500 + 1500);
      const result = await waitOrAction(estimatedMs);

      if (!dict.running) return;

      if (result.action === 'prev') {
        try { speechSynthesis.cancel(); } catch (e) {}
        if (i > 0) { i--; skipCurrent = true; break; }
        else { toast('已经是第一个了'); try { await speechPromise; } catch(e){} continue; }
      } else if (result.action === 'next') {
        try { speechSynthesis.cancel(); } catch (e) {}
        skipCurrent = true;
        break;
      } else if (result.action === 'replay') {
        try { speechSynthesis.cancel(); } catch (e) {}
        r--;
        continue;
      }

      try { await speechPromise; } catch (e) {}

      if (r < dict.repeatCount - 1) {
        const gapResult = await waitOrAction(dict.repeatIntervalMs);
        if (!dict.running) return;
        if (gapResult.action === 'prev') {
          try { speechSynthesis.cancel(); } catch (e) {}
          if (i > 0) { i--; skipCurrent = true; break; }
          else { toast('已经是第一个了'); }
          break;
        } else if (gapResult.action === 'next') {
          skipCurrent = true;
          break;
        } else if (gapResult.action === 'replay') {
          r = -1;
          break;
        }
      }
    }

    if (!dict.running) return;
    if (skipCurrent) { i++; continue; }

    let iv = dict.intervalMs;
    if (it.text.length === 4) iv *= 2;
    const gapResult = await waitOrAction(iv);
    if (!dict.running) return;
    if (gapResult.action === 'prev') {
      if (i > 0) { i--; continue; }
      else { toast('已经是第一个了'); }
    } else if (gapResult.action === 'next') {
      i++;
    } else if (gapResult.action === 'replay') {
      continue;
    } else {
      i++;
    }
  }

  if (dict.running) {
    dict.running = false;
    stopTimer();
    enterReview();
  }
}

function setCurrentWord(t) { $('currentWord').textContent = t; }
function setProgress(i, total) {
  $('progressText').textContent = '进度: ' + (i + 1) + ' / ' + total;
  $('progressFill').style.width = (total ? Math.round((i + 1) / total * 100) : 0) + '%';
}
function updateNavButtons(i, total) {
  $('prevBtn').disabled = (i <= 0);
  $('nextBtn').disabled = (i >= total - 1);
  $('replayBtn').disabled = false;
}
function startTimer() { timerInterval = setInterval(() => { $('timerText').textContent = '本次用时: ' + formatDur(Math.floor((Date.now() - dict.startTime) / 1000)); }, 1000); }
function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

function pauseResume() {
  if (dict.phase !== 'playing') return;
  if (dict.paused) {
    dict.paused = false;
    if (dict.resumeResolve) { dict.resumeResolve(); dict.resumeResolve = null; }
    $('pauseBtn').textContent = '⏸ 暂停';
  } else {
    dict.paused = true;
    try { speechSynthesis.cancel(); } catch (e) {}
    $('pauseBtn').textContent = '▶ 继续';
  }
}
function stopDictation() {
  dict.running = false;
  dict.paused = false;
  if (dict.resumeResolve) { dict.resumeResolve(); dict.resumeResolve = null; }
  if (dict.skipResolve) { dict.skipResolve(); dict.skipResolve = null; }
  if (dict.prevResolve) { dict.prevResolve(); dict.prevResolve = null; }
  if (dict.replayResolve) { dict.replayResolve(); dict.replayResolve = null; }
  try { speechSynthesis.cancel(); } catch (e) {}
  stopTimer();
  showPhase('idle');
}

function nextWord() {
  if (dict.phase !== 'playing' || !dict.running) return;
  if (dict.skipResolve) dict.skipResolve();
  try { speechSynthesis.cancel(); } catch (e) {}
}
function prevWord() {
  if (dict.phase !== 'playing' || !dict.running) return;
  if (dict.prevResolve) dict.prevResolve();
  try { speechSynthesis.cancel(); } catch (e) {}
}
function replayWord() {
  if (dict.phase !== 'playing' || !dict.running) return;
  if (dict.replayResolve) dict.replayResolve();
  try { speechSynthesis.cancel(); } catch (e) {}
}

function showPhase(p) {
  dict.phase = p;
  $('reviewCard').classList.toggle('hidden', p !== 'review');
  const ctrl = $('dictCtrlBtn');
  if (p === 'idle') {
    ctrl.textContent = '🚀 开始默写';
    ctrl.className = 'primary';
    ctrl.disabled = false;
  } else if (p === 'playing') {
    ctrl.textContent = '⏹ 停止';
    ctrl.className = 'danger';
    ctrl.disabled = false;
  } else {
    ctrl.disabled = true; // review 阶段由“标记完成”按钮收尾
  }
  $('pauseBtn').disabled = (p !== 'playing');
  $('nextBtn').disabled = (p !== 'playing');
  $('prevBtn').disabled = (p !== 'playing');
  $('replayBtn').disabled = (p !== 'playing');
  $('pauseBtn').textContent = '⏸ 暂停';
  if (p === 'idle') {
    $('currentWord').textContent = '准备默写';
    $('progressText').textContent = '进度: 0 / 0';
    $('progressFill').style.width = '0%';
    $('timerText').textContent = '本次用时: 0秒';
  }
  if (p === 'review') $('currentWord').textContent = '🎉 默写完成';
}

// 主控制按钮：空闲时开始默写，进行中（含暂停）时停止
function onDictCtrl() {
  if (dict.phase === 'idle') startDictation();
  else stopDictation();
}

function enterReview() {
  showPhase('review');
  const el = $('reviewList');
  el.innerHTML = '';
  dict.items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 'review-item';
    d.innerHTML =
      '<span class="rt">' + esc(it.text) + (it.meaning ? '（' + esc(it.meaning) + '）' : '') + '</span>' +
      '<button class="mark-btn" id="okBtn' + i + '" onclick="toggleMark(' + i + ', \'ok\')">✓ 正确</button>' +
      '<button class="mark-btn" id="wrongBtn' + i + '" onclick="toggleMark(' + i + ', \'wrong\')">✗ 错误</button>';
    el.appendChild(d);
  });
}
function toggleMark(i, kind) {
  dict.marks[i] = (dict.marks[i] === kind) ? '' : kind;
  const ok = $('okBtn' + i), wrong = $('wrongBtn' + i);
  ok.classList.toggle('sel-ok', dict.marks[i] === 'ok');
  wrong.classList.toggle('sel-wrong', dict.marks[i] === 'wrong');
}
function completeDictation() {
  const items = dict.items;
  let wrongCount = 0;
  const today = todayStr();
  for (let i = 0; i < items.length; i++) {
    const w = data.chapters[items[i].ci].words[items[i].wi];
    const wrong = dict.marks[i] === 'wrong';
    w.scoreCount += 1;
    if (wrong) {
      w.wrongCount += 1;
      w.lastErrorDate = today;
      w.scoreSum += 0;
      wrongCount++;
    } else {
      w.correctCount += 1;
      w.lastCorrectDate = today;
      w.scoreSum += 100;
    }
  }
  const total = items.length;
  const correctCount = total - wrongCount;
  const score = total ? (100 * correctCount / total) : 0;
  const elapsedSec = Math.floor((Date.now() - dict.startTime) / 1000);

  data.history.push({ date: nowStr(), chapters: dict.selectedChapters.join('、'), total, wrongCount, score });

  saveData();
  renderChapterList();
  renderWords();
  renderHistory();
  renderChart();
  showPhase('idle');
  closeDict();
  showResult({ total, correctCount, wrongCount, score, elapsedSec });
}
function showResult(r) {
  const wrong = dict.items.filter((it, i) => dict.marks[i] === 'wrong')
    .map(it => it.meaning ? it.text + '（' + it.meaning + '）' : it.text);
  let html =
    '<div class="result-line">单词总数: <b>' + r.total + '</b></div>' +
    '<div class="result-line">正确: <b style="color:var(--ok);">' + r.correctCount + '</b></div>' +
    '<div class="result-line">错误: <b style="color:var(--danger);">' + r.wrongCount + '</b></div>' +
    '<div class="result-line">用时: <b>' + formatDur(r.elapsedSec) + '</b></div>' +
    '<div class="result-line" style="font-size:22px;color:var(--primary);font-weight:800;margin-top:12px;">得分: ' + r.score.toFixed(1) + ' 分</div>';
  if (wrong.length) html += '<div class="result-wrong">❌ 错误单词:<br>' + wrong.map(esc).join('、') + '</div>';
  openModal('默写结果', html + '<div class="row"><button class="primary" onclick="closeModal()">关闭</button></div>');
}
