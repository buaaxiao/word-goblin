import { s as resolveVoice, t as BaseVoiceProvider } from "../_chunks/_provider.mjs";
//#region src/providers/browser.ts
var BrowserTTS = class extends BaseVoiceProvider {
	name = "browser";
	constructor() {
		super();
		if (typeof globalThis.speechSynthesis === "undefined") throw new Error("Web Speech API is not available in this environment");
	}
	async synthesize(_text, _options) {
		throw new Error("Browser TTS does not support raw audio export. Use speak() instead.");
	}
	async save(_text, _outputFile, _options) {
		throw new Error("Browser TTS does not support saving to file.");
	}
	hasVoice(id) {
		return speechSynthesis.getVoices().some((v) => v.voiceURI === id || v.name === id);
	}
	async listVoices() {
		return (await _getVoices()).map((v) => ({
			id: v.voiceURI,
			name: v.name,
			lang: v.lang
		}));
	}
	async speak(text, options) {
		const voiceId = await resolveVoice(options?.voice, () => this.listVoices(), (id) => this.hasVoice(id));
		const utterance = new SpeechSynthesisUtterance(text);
		if (voiceId) {
			const match = speechSynthesis.getVoices().find((v) => v.voiceURI === voiceId || v.name === voiceId);
			if (match) utterance.voice = match;
		}
		if (options?.rate != null) utterance.rate = options.rate;
		// 本地补丁：传入 lang 时设置 utterance.lang，保证中文等非默认语音可用
		if (options?.lang) utterance.lang = options.lang;
		return new Promise((resolve, reject) => {
			utterance.onend = () => resolve();
			utterance.onerror = (e) => reject(/* @__PURE__ */ new Error(`Speech synthesis failed: ${e.error}`));
			speechSynthesis.speak(utterance);
		});
	}
};
/** Voices may load asynchronously in some browsers */
function _getVoices() {
	const voices = speechSynthesis.getVoices();
	if (voices.length > 0) return Promise.resolve(voices);
	return new Promise((resolve) => {
		speechSynthesis.addEventListener("voiceschanged", () => {
			resolve(speechSynthesis.getVoices());
		}, { once: true });
	});
}
//#endregion
export { BrowserTTS };
