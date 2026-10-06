import { s as resolveVoice, t as BaseVoiceProvider } from "./_provider.mjs";
//#region src/voipi.ts
/**
* Named provider factories for explicit provider selection.
* Keys are the provider names used in CLI and programmatic API.
*/
const providerMap = {
	macos: (opts) => import("../providers/macos.mjs").then((m) => new m.MacOS(opts)),
	piper: (opts) => import("../providers/piper.mjs").then((m) => new m.Piper(opts)),
	"edge-tts": (opts) => import("../providers/edge-tts.mjs").then((m) => new m.EdgeTTS(opts)),
	"google-tts": (opts) => import("../providers/google-tts.mjs").then((m) => new m.GoogleTTS(opts)),
	"espeak-ng": (opts) => import("./espeak-ng.mjs").then((n) => n.n).then((m) => m.EspeakNG.create(opts)),
	browser: () => import("../providers/browser.mjs").then((m) => new m.BrowserTTS())
};
const _isDarwin = globalThis.process?.platform === "darwin";
const _isLinux = globalThis.process?.platform === "linux";
/** Default auto-detection chain: macOS (if darwin) → espeak-ng (if linux) → edge-tts → google-tts → piper */
const _defaultProviders = [
	..._isDarwin ? [providerMap.macos] : [],
	providerMap["edge-tts"],
	providerMap["google-tts"],
	providerMap.piper,
	..._isLinux ? [providerMap["espeak-ng"]] : []
];
var VoiPi = class extends BaseVoiceProvider {
	get name() {
		return this._provider?.name ?? "voipi";
	}
	_provider;
	_resolving;
	_factories;
	_factoryIndex = 0;
	constructor(options) {
		super();
		const defs = options?.providers?.filter((p) => p && p !== "auto");
		this._factories = defs && defs.length > 0 ? defs.map((p) => _toFactory(p)) : _defaultProviders;
	}
	/** Resolve the first available provider from the chain. */
	async resolveProvider() {
		if (this._provider) return this._provider;
		const pending = this._resolving ?? (this._resolving = _resolve(this._factories, this._factoryIndex));
		try {
			const [provider, index] = await pending;
			this._provider = provider;
			this._factoryIndex = index;
			return provider;
		} finally {
			this._resolving = void 0;
		}
	}
	async synthesize(text, options) {
		return this._callWithFallback((provider) => provider.synthesize(text, options));
	}
	async speak(text, options) {
		return this._callWithFallback(async (provider) => {
			const voice = await resolveVoice(options?.voice, provider.listVoices?.bind(provider), provider.hasVoice?.bind(provider));
			return provider.speak(text, voice ? {
				...options,
				voice
			} : options);
		});
	}
	async save(text, outputFile, options) {
		return this._callWithFallback(async (provider) => {
			const voice = await resolveVoice(options?.voice, provider.listVoices?.bind(provider), provider.hasVoice?.bind(provider));
			return provider.save(text, outputFile, voice ? {
				...options,
				voice
			} : options);
		});
	}
	async listVoices() {
		const provider = await this.resolveProvider();
		if (!provider.listVoices) throw new Error(`Provider "${provider.name}" does not support listing voices`);
		return provider.listVoices();
	}
	/** Try current provider, fallback to remaining on failure. */
	async _callWithFallback(fn) {
		const provider = await this.resolveProvider();
		try {
			return await fn(provider);
		} catch (error) {
			if (_isAbortError(error)) throw error;
			if (this._factories.slice(this._factoryIndex + 1).length === 0) throw new Error(`All providers failed`);
			this._provider = void 0;
			this._factoryIndex += 1;
			return this._callWithFallback(fn);
		}
	}
};
function _isAbortError(error) {
	if (error instanceof DOMException && error.name === "AbortError") return true;
	if (error instanceof Error && error.name === "AbortError") return true;
	return false;
}
function _toFactory(def) {
	if (typeof def === "function") return def;
	const [name, options] = typeof def === "string" ? [def] : def;
	const creator = providerMap[name];
	if (!creator) throw new Error(`Unknown provider: "${name}". Available: ${Object.keys(providerMap).join(", ")}`);
	return () => creator(options);
}
async function _resolve(factories, startIndex = 0) {
	const errors = [];
	for (let i = startIndex; i < factories.length; i++) try {
		return [await factories[i](), i];
	} catch (error) {
		errors.push(error.message);
	}
	throw new Error(`No provider available:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
}
//#endregion
export { providerMap as n, VoiPi as t };
