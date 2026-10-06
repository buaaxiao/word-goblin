/* ===================================================================
 * lib/voipi/voipi-loader.js - 浏览器端统一语音入口（VoiPi）
 *
 * 统一中英文播报的 TTS 库，提供方自动降级链：
 *   browser（系统 speechSynthesis）→ edge-tts → google-tts
 *
 * 说明：
 *  - 通过 <script type="module"> 引入，初始化后暴露全局 window.voipi
 *  - 浏览器内可靠路径为 browser（系统内置 TTS，离线可用）；
 *    edge-tts / google-tts 为网络供应商，不可达时由 VoiPi 自动跳过（自动降级）
 *  - 每次 speak 使用全新 VoiPi 实例，避免一次播报失败后的降级状态残留
 *  - 语言自动识别：优先使用调用方传入的 lang，缺省时按文本脚本识别
 *
 * 用法：
 *   await voipi.speak(text, { lang: "zh-CN"|"en-US", rate: 0.9 })
 *   voipi.stop() / voipi.pause() / voipi.resume()
 *
 * 来源：npm voipi@0.0.12（MIT），vendored 见同目录 _chunks、providers、LICENSE
 * =================================================================== */
import { t as VoiPi } from "./_chunks/voipi.mjs";
import { t as detectLanguage } from "./_chunks/_lang.mjs";

const CHAIN = ["browser", "edge-tts", "google-tts"];
const DEFAULT_RATE = 0.9;

let currentAbort = null;

/** 每次新建实例，避免自动降级时的 provider 状态在多次播报间残留 */
function newCore() {
  return new VoiPi({ providers: CHAIN });
}

/** 尽量拿到浏览器语音列表（某些浏览器 voices 异步加载） */
function loadBrowserVoices() {
  if (typeof globalThis.speechSynthesis === "undefined") return Promise.resolve([]);
  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(speechSynthesis.getVoices() || []), 1200);
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timer);
        resolve(speechSynthesis.getVoices() || []);
      },
      { once: true },
    );
  });
}

/** 按语言挑选浏览器语音（精确 → 语言前缀 → 系统默认） */
function pickBrowserVoice(voices, lang) {
  const norm = (s) => String(s).replace("_", "-").toLowerCase();
  const want = norm(lang || "");
  for (const v of voices) if (want && norm(v.lang) === want) return v.voiceURI || v.name;
  const base = want.slice(0, 2);
  for (const v of voices) if (base && norm(v.lang).indexOf(base) === 0) return v.voiceURI || v.name;
  for (const v of voices) if (v.default) return v.voiceURI || v.name;
  return undefined;
}

function isAbort(err) {
  return !!(err && err.name === "AbortError");
}

const api = {
  /**
   * 播报一段文本。lang 如 "zh-CN"/"en-US"，缺省时按文本自动识别。
   * @param {string} text 播报文本
   * @param {{lang?: string, rate?: number, voice?: string}} [options]
   * @returns {Promise<void>} 播报结束（或全部提供方失败）后 resolve
   */
  async speak(text, options = {}) {
    const ctrl = new AbortController();
    currentAbort = ctrl;
    const lang = options.lang || detectLanguage(String(text));
    const base = {
      rate: options.rate ?? DEFAULT_RATE,
      lang,
      signal: ctrl.signal,
    };

    try {
      const core = newCore();
      const provider = await core.resolveProvider();
      if (provider && provider.name === "browser") {
        // 浏览器内置 TTS：显式指定匹配语言的语音
        const voice = pickBrowserVoice(await loadBrowserVoices(), lang);
        await core.speak(text, voice ? { ...base, voice } : base);
        return; // 本实例自带降级链：browser 失败会依次尝试 edge-tts → google-tts
      }
      await core.speak(text, base);
    } catch (err) {
      if (isAbort(err)) return;
      // 全部提供方不可用：静默结束，不影响默写流程
      console.debug("[voipi] no provider available, skip speech:", err && err.message);
    }
  },

  /** 停止当前播报（中止合成 + 清空浏览器语音队列） */
  stop() {
    if (currentAbort) {
      try {
        currentAbort.abort();
      } catch (e) {}
      currentAbort = null;
    }
    if (typeof globalThis.speechSynthesis !== "undefined") {
      try {
        speechSynthesis.cancel();
      } catch (e) {}
    }
  },

  /** 暂停（仅浏览器 TTS 有效） */
  pause() {
    if (typeof globalThis.speechSynthesis !== "undefined") {
      try {
        speechSynthesis.pause();
      } catch (e) {}
    }
  },

  /** 继续（仅浏览器 TTS 有效） */
  resume() {
    if (typeof globalThis.speechSynthesis !== "undefined") {
      try {
        speechSynthesis.resume();
      } catch (e) {}
    }
  },
};

globalThis.voipi = api;