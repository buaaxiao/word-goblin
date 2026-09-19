/* ===================================================================
 * js/dictation.js - 语音与默写引擎
 * 自 index.html 内联脚本拆分而来；所有函数保持为全局 API（兼容内联 onclick）。
 * =================================================================== */

let voiceList = [];
let voicesReady = false;
let lastSpeechError = "";

function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  const collect = () => {
    try {
      voiceList = speechSynthesis.getVoices();
    } catch (e) {
      voiceList = [];
    }
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
  } catch (e) {
    voiceList = [];
  }
  if (!voiceList.length) return null;
  const norm = (s) => String(s).replace("_", "-").toLowerCase();
  const base = norm(lang || "").slice(0, 2);
  let best = null,
    bestScore = 10;
  for (const v of voiceList) {
    const l = norm(v.lang);
    let score;
    if (base && l === norm(lang)) score = 0;
    else if (base && l.indexOf(base) === 0) score = 1;
    else if (v.default) score = 2;
    else score = 3;
    if (!v.localService) score += 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

function speak(text, lang) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }
    const doSpeak = () => {
      try {
        speechSynthesis.resume();
      } catch (e) {}

      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(lang);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else {
        u.lang = lang || "zh-CN";
      }
      u.rate = 0.9;
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      u.onend = finish;
      u.onerror = (e) => {
        lastSpeechError = (e && e.error) || "unknown";
        finish();
      };
      // ★ 兜底超时：时间延长到 8 秒起，且兜底时 cancel 掉残留 TTS
      setTimeout(
        () => {
          try {
            speechSynthesis.cancel();
          } catch (e) {}
          finish();
        },
        Math.max(8000, text.length * 1000 + 4000),
      );
      try {
        speechSynthesis.speak(u);
      } catch (e) {
        finish();
      }
    };
    if (voicesReady) {
      doSpeak();
      return;
    }
    let tries = 0;
    const wait = () => {
      try {
        voiceList = speechSynthesis.getVoices();
        voicesReady = voiceList.length > 0;
      } catch (e) {}
      if (voicesReady || ++tries > 12) {
        doSpeak();
        return;
      }
      setTimeout(wait, 100);
    };
    wait();
  });
}

function testSpeech() {
  if (!("speechSynthesis" in window)) {
    toast("当前浏览器不支持语音");
    return;
  }
  try {
    speechSynthesis.resume();
  } catch (e) {}
  const zh = "你好，我是单词精灵，现在测试发音。";
  const u = new SpeechSynthesisUtterance(zh);
  const v = pickVoice("zh-CN");
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else {
    u.lang = "zh-CN";
  }
  u.rate = 0.9;
  u.onend = () => toast("发音正常");
  u.onerror = () => toast("发音失败：请检查系统 TTS 中文语音是否已安装启用");
  try {
    speechSynthesis.speak(u);
  } catch (e) {
    toast("发音失败：" + e.message);
  }
  toast("正在测试发音…");
}

const dict = {
  running: false,
  paused: false,
  phase: "idle",
  items: [],
  marks: [],
  idx: 0,
  intervalMs: 12000,
  repeatCount: 3,
  repeatIntervalMs: 2000,
  speakChinese: false,
  mode: 0,
  selectedChapters: [],
  startTime: 0,
  resumeResolve: null,
  skipResolve: null,
  prevResolve: null,
  replayResolve: null,
  currentRepeat: 0,
};

// ===== 计时器 =====
// timerInterval：setInterval 句柄
// __elapsedBeforePause：暂停前累计的秒数（暂停时冻结）
// 恢复时通过顺延 dict.startTime 让 Date.now()-startTime 继续从这个值算起，
// 这样 elapsedSec 里就不会把暂停时长算进去。
let timerInterval = null;
let __elapsedBeforePause = 0;

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
        const errorNewer =
          !!w.lastErrorDate &&
          (w.lastCorrectDate === "" || w.lastErrorDate > w.lastCorrectDate);
        if (!errorNewer) continue;
      }
      items.push({ text: w.text, meaning: w.meaning, ci, wi });
    }
  }
  return items;
}
function noItemsMessage() {
  if (dict.mode === 2)
    return "没有可播报的单词（所选章节中没有“最后默写错误”的单词）";
  if (dict.mode === 1) return "没有错题可播报（所选章节中暂无标记错误的单词）";
  return "请先在“词库”勾选要默写的章节，并确保章节包含单词";
}
function waitResume() {
  return new Promise((resolve) => {
    if (!dict.paused) {
      resolve();
      return;
    }
    dict.resumeResolve = resolve;
  });
}
function sleep(ms) {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    (function loop() {
      if (!dict.running) {
        resolve();
        return;
      }
      if (dict.paused) {
        waitResume().then(loop);
        return;
      }
      if (Date.now() >= end) {
        resolve();
        return;
      }
      setTimeout(loop, Math.min(200, end - Date.now()));
    })();
  });
}

function waitOrAction(timeoutMs) {
  return new Promise((resolve) => {
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
      resolve({ action: "timeout" });
    }, timeoutMs);

    dict.skipResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ action: "next" });
    };
    dict.prevResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ action: "prev" });
    };
    dict.replayResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ action: "replay" });
    };
  });
}

function startDictation() {
  // ★ 从持久化设置读（不依赖 DOM）
  const s = getDictationSettings();
  dict.intervalMs = (s.intervalSec || 0) * 1000;
  dict.repeatCount = Math.max(1, s.repeatCount || 3);
  dict.repeatIntervalMs = (s.repeatIntervalSec || 0) * 1000;

  // ★ 报词方式只看设置（默认汉语）
  const dl = normalizeDictLang(getDefaultDictLang());
  dict.speakChinese = dictLangIsChinese(dl);

  dict.mode = s.mode || 0;

  // 选中章节检查
  const selChs = data.chapters.filter((c) => c.selected);
  if (!selChs.length) {
    showAlert("未选中任何章节，不能开始默写");
    return;
  }
  dict.selectedChapters = selChs.map((c) => c.name);

  // 多章节报词方式提示：不再需要
  const hint = $("dictLangHint");
  if (hint) hint.classList.add("hidden");

  let items = collectItems();
  if (!items.length) {
    toast(noItemsMessage());
    return;
  }

  // ★ 按"播报顺序"处理
  const order = s.playOrder || 0;
  if (order === 1) {
    // 随机：打乱
    shuffle(items);
  } else if (order === 3) {
    // 单一：只播第一个
    items = items.slice(0, 1);
  }
  // order === 0（顺序）/ 2（循环）：保持原顺序

  dict.items = items;
  dict.marks = items.map(() => "");
  dict.idx = 0;
  dict.running = true;
  dict.paused = false;
  dict.startTime = Date.now();
  dict.skipResolve = null;
  dict.prevResolve = null;
  dict.replayResolve = null;

  // ★ 重置暂停累计
  __elapsedBeforePause = 0;

  showPhase("playing");
  startTimer();
  runDictation();
}

// 顶部快捷“开始默写”：弹出默写弹窗并立即启动；未选中任何章节时阻止弹窗
function startDictQuick() {
  const selChs = data.chapters.filter((c) => c.selected);
  if (!selChs.length) {
    showAlert("未选中任何章节，不能开始默写");
    return;
  }
  if (!hasItemsToDictate()) {
    toast(noItemsMessage());
    return;
  }
  openDict();
  setTimeout(function () {
    startDictation();
  }, 350);
}

async function runDictation() {
  const order = getDictationSettings().playOrder || 0;
  const loopMode = order === 2;

  do {
    const items = dict.items;
    let i = 0;
    while (i < items.length && dict.running) {
      if (dict.paused) await waitResume();
      if (!dict.running) return;

      dict.idx = i;
      const it = items[i];
      const spoken = dict.speakChinese && it.meaning ? it.meaning : it.text;
      const hasChinese = /[\u4e00-\u9fff]/.test(spoken);
      const lang = dict.speakChinese || hasChinese ? "zh-CN" : "en-US";

      try {
        speechSynthesis.cancel();
      } catch (e) {}

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

        if (result.action === "prev") {
          try {
            speechSynthesis.cancel();
          } catch (e) {}
          if (i > 0) {
            i--;
            skipCurrent = true;
            break;
          } else {
            toast("已经是第一个了");
            try {
              await speechPromise;
            } catch (e) {}
            continue;
          }
        } else if (result.action === "next") {
          try {
            speechSynthesis.cancel();
          } catch (e) {}
          skipCurrent = true;
          break;
        } else if (result.action === "replay") {
          try {
            speechSynthesis.cancel();
          } catch (e) {}
          r--;
          continue;
        }

        try {
          await speechPromise;
        } catch (e) {}

        if (r < dict.repeatCount - 1) {
          const gapResult = await waitOrAction(dict.repeatIntervalMs);
          if (!dict.running) return;
          if (gapResult.action === "prev") {
            try {
              speechSynthesis.cancel();
            } catch (e) {}
            if (i > 0) {
              i--;
              skipCurrent = true;
              break;
            } else {
              toast("已经是第一个了");
            }
            break;
          } else if (gapResult.action === "next") {
            skipCurrent = true;
            break;
          } else if (gapResult.action === "replay") {
            r = -1;
            break;
          }
        }
      }

      if (!dict.running) return;
      if (skipCurrent) {
        i++;
        continue;
      }

      let iv = dict.intervalMs;
      if (it.text.length === 4) iv *= 2;
      const gapResult = await waitOrAction(iv);
      if (!dict.running) return;
      if (gapResult.action === "prev") {
        if (i > 0) {
          i--;
          continue;
        } else {
          toast("已经是第一个了");
        }
      } else if (gapResult.action === "next") {
        i++;
      } else if (gapResult.action === "replay") {
        continue;
      } else {
        i++;
      }
    }

    // ★ 循环模式：重置 idx，从头再来；顺序/随机/单一：退出
    if (loopMode && dict.running) {
      dict.idx = 0;
      // 可加一点间隔，避免连续刷新太快
      await waitOrAction(500);
    }
  } while (loopMode && dict.running);

  if (dict.running) {
    dict.running = false;
    stopTimer();
    enterReview();
  }
}

function setCurrentWord(t) {
  $("currentWord").textContent = t;
}
function setProgress(i, total) {
  $("progressText").textContent = "进度: " + (i + 1) + " / " + total;
  $("progressFill").style.width =
    (total ? Math.round(((i + 1) / total) * 100) : 0) + "%";
}
function updateNavButtons(i, total) {
  $("prevBtn").disabled = i <= 0;
  $("nextBtn").disabled = i >= total - 1;
  $("replayBtn").disabled = false;
}
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed =
      __elapsedBeforePause + Math.floor((Date.now() - dict.startTime) / 1000);
    $("timerText").textContent = "本次用时: " + formatDur(elapsed);
  }, 1000);
}
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function pauseResume() {
  if (dict.phase !== "playing") return;

  if (dict.paused) {
    // ===== 继续 =====
    dict.paused = false;
    if (dict.resumeResolve) {
      dict.resumeResolve();
      dict.resumeResolve = null;
    }

    // ★ 恢复计时：把 startTime 顺延，抵消暂停时长
    dict.startTime = Date.now() - __elapsedBeforePause * 1000;
    startTimer();

    $("pauseBtn").textContent = "⏸ 暂停";
  } else {
    // ===== 暂停 =====
    dict.paused = true;
    try {
      speechSynthesis.cancel();
    } catch (e) {}

    // ★ 暂停计时：记录已累计秒数，然后停表
    __elapsedBeforePause = Math.floor((Date.now() - dict.startTime) / 1000);
    stopTimer();
    // 立刻刷新一次显示，保证数字准确
    $("timerText").textContent = "本次用时: " + formatDur(__elapsedBeforePause);

    $("pauseBtn").textContent = "▶ 继续";
  }
}
function stopDictation() {
  dict.running = false;
  dict.paused = false;
  if (dict.resumeResolve) {
    dict.resumeResolve();
    dict.resumeResolve = null;
  }
  if (dict.skipResolve) {
    dict.skipResolve();
    dict.skipResolve = null;
  }
  if (dict.prevResolve) {
    dict.prevResolve();
    dict.prevResolve = null;
  }
  if (dict.replayResolve) {
    dict.replayResolve();
    dict.replayResolve = null;
  }
  try {
    speechSynthesis.cancel();
  } catch (e) {}
  stopTimer();
  __elapsedBeforePause = 0;
  showPhase("idle");
}

// 提前结束默写（用户点「停止」按钮），进入复习阶段，不关闭弹窗
function finishDictation() {
  if (dict.phase !== "playing") return;

  // 截断 items 到已播报的部分（含当前正在播报的那个）
  const playedCount = Math.min(dict.idx + 1, dict.items.length);
  if (playedCount < dict.items.length) {
    dict.items = dict.items.slice(0, playedCount);
    dict.marks = dict.marks.slice(0, playedCount);
  }

  // 先停掉正在进行的 TTS 和定时器
  try {
    speechSynthesis.cancel();
  } catch (e) {}
  stopTimer();

  // 触发所有挂起的 Promise，让 runDictation 的循环尽快退出
  dict.running = false;
  dict.paused = false;
  if (dict.resumeResolve) {
    dict.resumeResolve();
    dict.resumeResolve = null;
  }
  if (dict.skipResolve) {
    dict.skipResolve();
    dict.skipResolve = null;
  }
  if (dict.prevResolve) {
    dict.prevResolve();
    dict.prevResolve = null;
  }
  if (dict.replayResolve) {
    dict.replayResolve();
    dict.replayResolve = null;
  }

  // ★ 重置暂停累计
  __elapsedBeforePause = 0;

  // 更新大字并进入复习
  if (typeof setCurrentWord === "function") setCurrentWord("🎉 默写完成");
  enterReview();
}

function nextWord() {
  if (dict.phase !== "playing" || !dict.running) return;
  if (dict.skipResolve) dict.skipResolve();
  try {
    speechSynthesis.cancel();
  } catch (e) {}
}
function prevWord() {
  if (dict.phase !== "playing" || !dict.running) return;
  if (dict.prevResolve) dict.prevResolve();
  try {
    speechSynthesis.cancel();
  } catch (e) {}
}
function replayWord() {
  if (dict.phase !== "playing" || !dict.running) return;
  if (dict.replayResolve) dict.replayResolve();
  try {
    speechSynthesis.cancel();
  } catch (e) {}
}

function showPhase(p) {
  dict.phase = p;
  $("reviewCard").classList.toggle("hidden", p !== "review");

  // ★ 导航组（上一个/重播/下一个）：只在 playing 显示
  const navGroup = $("dictNavGroup");
  if (navGroup) navGroup.classList.toggle("hidden", p !== "playing");

  // ★ 主控组（开始/停止 + 暂停容器）：review 时隐藏
  const mainCtrl = $("dictMainCtrl");
  if (mainCtrl) mainCtrl.classList.toggle("hidden", p === "review");

  // ★ 暂停按钮：只在 playing 显示（"开始默写/停止"按钮保留）
  const pauseBtn = $("pauseBtn");
  if (pauseBtn) pauseBtn.classList.toggle("hidden", p !== "playing");

  const ctrl = $("dictCtrlBtn");
  if (p === "idle") {
    ctrl.textContent = "🚀 开始默写";
    ctrl.className = "primary";
    ctrl.disabled = false;
  } else if (p === "playing") {
    ctrl.textContent = "⏹ 停止";
    ctrl.className = "danger";
    ctrl.disabled = false;
  } else {
    ctrl.disabled = true;
  }

  $("nextBtn").disabled = p !== "playing";
  $("prevBtn").disabled = p !== "playing";
  $("replayBtn").disabled = p !== "playing";

  if (p === "idle") {
    $("currentWord").textContent = "准备默写";
    $("progressText").textContent = "进度: 0 / 0";
    $("progressFill").style.width = "0%";
    $("timerText").textContent = "本次用时: 0秒";
  }
  if (p === "review") $("currentWord").textContent = "🎉 默写完成";
}

// 主控制按钮：空闲时开始默写，进行中（含暂停）时停止
function onDictCtrl() {
  if (dict.phase === "idle") startDictation();
  else finishDictation(); // playing 阶段点「停止」→ 进复习，而不是回 idle
}

function enterReview() {
  showPhase("review");
  const el = $("reviewList");
  el.innerHTML = "";
  dict.items.forEach((it, i) => {
    const d = document.createElement("div");
    d.className = "review-item";
    d.innerHTML =
      '<span class="rt">' +
      esc(it.text) +
      (it.meaning ? "（" + esc(it.meaning) + "）" : "") +
      "</span>" +
      '<button class="mark-btn" id="okBtn' +
      i +
      '" onclick="toggleMark(' +
      i +
      ", 'ok')\">✓ 正确</button>" +
      '<button class="mark-btn" id="wrongBtn' +
      i +
      '" onclick="toggleMark(' +
      i +
      ", 'wrong')\">✗ 错误</button>";
    el.appendChild(d);
  });
}

function toggleMark(i, kind) {
  dict.marks[i] = dict.marks[i] === kind ? "" : kind;
  const ok = $("okBtn" + i),
    wrong = $("wrongBtn" + i);
  ok.classList.toggle("sel-ok", dict.marks[i] === "ok");
  wrong.classList.toggle("sel-wrong", dict.marks[i] === "wrong");
}

// 出分数：若有未标记的单词，先提示
function completeDictation() {
  const items = dict.items;
  const unmarked = [];
  for (let i = 0; i < items.length; i++) {
    if (!dict.marks[i]) unmarked.push(i);
  }

  if (unmarked.length > 0) {
    openConfirmModal({
      title: "提示",
      body:
        "还有 <b>" +
        unmarked.length +
        "</b> 个单词未标记。<br>" +
        '系统将默认把这些单词视为<b style="color:var(--ok);">正确</b>。<br><br>' +
        "确定继续出分数吗？",
      okTitle: "继续",
      onOk: doCompleteDictation,
    });
    return;
  }

  // 全部已标记，直接出分数
  doCompleteDictation();
}

// 真正统计 & 出分数
function doCompleteDictation() {
  const items = dict.items;
  let wrongCount = 0;
  const today = todayStr();
  for (let i = 0; i < items.length; i++) {
    const w = data.chapters[items[i].ci].words[items[i].wi];
    const wrong = dict.marks[i] === "wrong";
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
  const score = total ? (100 * correctCount) / total : 0;
  const elapsedSec = Math.floor((Date.now() - dict.startTime) / 1000);

  data.history.push({
    date: nowStr(),
    chapters: dict.selectedChapters.join("、"),
    total,
    wrongCount,
    score,
  });

  saveData();
  renderChapterList();
  renderWords();
  renderHistory();
  renderChart();
  showPhase("idle");
  closeDict();
  showResult({ total, correctCount, wrongCount, score, elapsedSec });
}

function showResult(r) {
  const wrong = dict.items
    .filter((it, i) => dict.marks[i] === "wrong")
    .map((it) => (it.meaning ? it.text + "（" + it.meaning + "）" : it.text));

  // 得分颜色（与历史列表的评分色一致）
  let scoreColor;
  if (r.score >= 90) scoreColor = "linear-gradient(135deg, #2dbf7f, #22a06b)";
  else if (r.score >= 70)
    scoreColor = "linear-gradient(135deg, #5b8def, #4a7cff)";
  else if (r.score >= 50)
    scoreColor = "linear-gradient(135deg, #fbbf24, #f59e0b)";
  else scoreColor = "linear-gradient(135deg, #f56b6b, #f05252)";

  const wrongHtml = wrong.length
    ? '<div class="result-wrong-list">' +
      '<div class="result-wrong-title">❌ 错误单词（' +
      wrong.length +
      "）</div>" +
      '<div class="result-wrong-items">' +
      wrong
        .map((w) => '<span class="result-wrong-item">' + esc(w) + "</span>")
        .join("") +
      "</div>" +
      "</div>"
    : '<div class="result-perfect">🎉 全部正确！</div>';

  const html =
    '<div class="result-score-card">' +
    '<div class="result-score-num" style="background:' +
    scoreColor +
    '">' +
    r.score.toFixed(0) +
    "</div>" +
    '<div class="result-score-label">得分</div>' +
    "</div>" +
    '<div class="result-grid">' +
    '<div class="result-cell"><div class="result-cell-num">' +
    r.total +
    '</div><div class="result-cell-label">单词总数</div></div>' +
    '<div class="result-cell"><div class="result-cell-num" style="color:var(--ok);">' +
    r.correctCount +
    '</div><div class="result-cell-label">正确</div></div>' +
    '<div class="result-cell"><div class="result-cell-num" style="color:var(--danger);">' +
    r.wrongCount +
    '</div><div class="result-cell-label">错误</div></div>' +
    '<div class="result-cell"><div class="result-cell-num">' +
    formatDur(r.elapsedSec) +
    '</div><div class="result-cell-label">用时</div></div>' +
    "</div>" +
    wrongHtml;

  openModal(
    "默写结果",
    html +
      '<div class="row" style="justify-content:center;margin-top:18px;">' +
      '<button class="primary" onclick="closeModal()">关闭</button>' +
      "</div>",
  );
}

function hasItemsToDictate() {
  const s = getDictationSettings();
  const dl = normalizeDictLang(getDefaultDictLang());
  dict.speakChinese = dictLangIsChinese(dl);
  dict.mode = s.mode || 0;
  return collectItems().length > 0;
}
