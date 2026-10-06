import { s as resolveVoice, t as BaseVoiceProvider } from "./_provider.mjs";
import { t as detectLanguage } from "./_lang.mjs";
//#region src/_ws.ts
const WS_OPCODES = {
	TEXT: 1,
	BINARY: 2,
	CLOSE: 8,
	PING: 9,
	PONG: 10
};
var WebSocket = class WebSocket {
	socket;
	buf = Buffer.alloc(0);
	onmessage;
	onerror;
	onclose;
	constructor() {}
	static connect(url, headers) {
		return new WebSocket()._connect(url, headers);
	}
	send(data) {
		const payload = Buffer.from(data, "utf-8");
		const mask = crypto.getRandomValues(new Uint8Array(4));
		const masked = Buffer.from(payload);
		for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
		let header;
		if (payload.length < 126) header = Buffer.from([
			128 | WS_OPCODES.TEXT,
			128 | payload.length,
			...mask
		]);
		else if (payload.length < 65536) {
			header = Buffer.alloc(8);
			header[0] = 128 | WS_OPCODES.TEXT;
			header[1] = 254;
			header.writeUInt16BE(payload.length, 2);
			header.set(mask, 4);
		} else {
			header = Buffer.alloc(14);
			header[0] = 128 | WS_OPCODES.TEXT;
			header[1] = 255;
			header.writeBigUInt64BE(BigInt(payload.length), 2);
			header.set(mask, 10);
		}
		this.socket.write(Buffer.concat([header, masked]));
	}
	close() {
		const mask = crypto.getRandomValues(new Uint8Array(4));
		this.socket.write(Buffer.from([
			128 | WS_OPCODES.CLOSE,
			128,
			...mask
		]));
		this.socket.end();
	}
	_connect(url, headers) {
		const tls = globalThis.process?.getBuiltinModule?.("node:tls");
		const parsed = new URL(url);
		const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
		return new Promise((resolve, reject) => {
			const socket = tls.connect({
				host: parsed.hostname,
				port: 443,
				servername: parsed.hostname
			}, () => {
				const lines = [
					`GET ${parsed.pathname + parsed.search} HTTP/1.1`,
					`Host: ${headers.host || parsed.hostname}`,
					`Upgrade: websocket`,
					`Connection: Upgrade`,
					`Sec-WebSocket-Key: ${key}`,
					`Sec-WebSocket-Version: 13`,
					...Object.entries(headers).filter(([k]) => k.toLowerCase() !== "host").map(([k, v]) => `${k}: ${v}`),
					`\r\n`
				];
				socket.write(lines.join("\r\n"));
			});
			let handshakeDone = false;
			let handshakeBuf = Buffer.alloc(0);
			socket.on("data", (chunk) => {
				if (handshakeDone) return;
				handshakeBuf = Buffer.concat([handshakeBuf, chunk]);
				const idx = handshakeBuf.indexOf("\r\n\r\n");
				if (idx === -1) return;
				const statusLine = handshakeBuf.subarray(0, handshakeBuf.indexOf(13)).toString();
				if (!statusLine.includes(" 101 ")) {
					socket.destroy();
					reject(/* @__PURE__ */ new Error(`WebSocket upgrade failed: ${statusLine}`));
					return;
				}
				handshakeDone = true;
				const remaining = handshakeBuf.subarray(idx + 4);
				if (remaining.length > 0) socket.unshift(remaining);
				this.socket = socket;
				this._startReading();
				resolve(this);
			});
			socket.on("error", (err) => {
				if (!handshakeDone) reject(err);
				else this.onerror?.(err);
			});
			socket.on("close", () => {
				this.onclose?.();
			});
		});
	}
	_startReading() {
		this.socket.on("data", (chunk) => {
			this.buf = Buffer.concat([this.buf, chunk]);
			while (this.buf.length >= 2) {
				const opcode = this.buf[0] & 15;
				const isMasked = (this.buf[1] & 128) !== 0;
				let payloadLen = this.buf[1] & 127;
				let offset = 2;
				if (payloadLen === 126) {
					if (this.buf.length < 4) return;
					payloadLen = this.buf.readUInt16BE(2);
					offset = 4;
				} else if (payloadLen === 127) {
					if (this.buf.length < 10) return;
					payloadLen = Number(this.buf.readBigUInt64BE(2));
					offset = 10;
				}
				if (isMasked) offset += 4;
				if (this.buf.length < offset + payloadLen) return;
				const payload = this.buf.subarray(offset, offset + payloadLen);
				this.buf = this.buf.subarray(offset + payloadLen);
				if (opcode === WS_OPCODES.PING) {
					const mask = crypto.getRandomValues(new Uint8Array(4));
					const masked = Buffer.from(payload);
					for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
					let hdr;
					if (payload.length < 126) hdr = Buffer.from([
						128 | WS_OPCODES.PONG,
						128 | payload.length,
						...mask
					]);
					else if (payload.length < 65536) {
						hdr = Buffer.alloc(8);
						hdr[0] = 128 | WS_OPCODES.PONG;
						hdr[1] = 254;
						hdr.writeUInt16BE(payload.length, 2);
						hdr.set(mask, 4);
					} else {
						hdr = Buffer.alloc(14);
						hdr[0] = 128 | WS_OPCODES.PONG;
						hdr[1] = 255;
						hdr.writeBigUInt64BE(BigInt(payload.length), 2);
						hdr.set(mask, 10);
					}
					this.socket.write(Buffer.concat([hdr, masked]));
				} else if (opcode === WS_OPCODES.TEXT || opcode === WS_OPCODES.BINARY) this.onmessage?.({
					data: Buffer.from(payload),
					isBinary: opcode === WS_OPCODES.BINARY
				});
				else if (opcode === WS_OPCODES.CLOSE) this.socket.end();
			}
		});
	}
};
//#endregion
//#region src/providers/edge-tts.ts
var EdgeTTS = class extends BaseVoiceProvider {
	name = "edge-tts";
	defaultVoice;
	defaultRate;
	defaultPitch;
	defaultVolume;
	outputFormat;
	getDefaults() {
		return {
			voice: this.defaultVoice,
			rate: this.defaultRate
		};
	}
	hasVoice(id) {
		return /^[a-z]{2,3}(-[A-Z][A-Za-z]+)+-.+Neural$/.test(id);
	}
	constructor(options) {
		super();
		this.defaultVoice = options?.voice ?? "en-US-AvaNeural";
		this.defaultRate = options?.rate ?? "default";
		this.defaultPitch = options?.pitch ?? "default";
		this.defaultVolume = options?.volume ?? "default";
		this.outputFormat = options?.outputFormat ?? "audio-24khz-48kbitrate-mono-mp3";
	}
	defaultVoiceForLanguage(lang) {
		return LANG_VOICES[lang];
	}
	async synthesize(text, speakOpts) {
		return {
			data: await edgeSynthesize(text, await resolveVoice(speakOpts?.voice, () => this.listVoices(), (id) => this.hasVoice(id)) ?? this.defaultVoiceForLanguage(speakOpts?.lang ?? detectLanguage(text)) ?? this.defaultVoice, speakOpts?.rate != null ? rateToString(speakOpts.rate) : this.defaultRate, this.defaultPitch, this.defaultVolume, this.outputFormat, speakOpts?.signal),
			ext: ".mp3"
		};
	}
	async listVoices() {
		return (await (await fetch(VOICES_URL)).json()).map((v) => ({
			id: v.ShortName,
			name: v.FriendlyName,
			lang: v.Locale
		}));
	}
};
const LANG_VOICES = {
	ar: "ar-SA-HamedNeural",
	bn: "bn-IN-TanishaaNeural",
	cs: "cs-CZ-VlastaNeural",
	da: "da-DK-ChristelNeural",
	de: "de-DE-KatjaNeural",
	el: "el-GR-AthinaNeural",
	es: "es-ES-ElviraNeural",
	fa: "fa-IR-DilaraNeural",
	fr: "fr-FR-DeniseNeural",
	gu: "gu-IN-DhwaniNeural",
	he: "he-IL-HilaNeural",
	hi: "hi-IN-SwaraNeural",
	ja: "ja-JP-NanamiNeural",
	km: "km-KH-SreymomNeural",
	kn: "kn-IN-SapnaNeural",
	ko: "ko-KR-SunHiNeural",
	ml: "ml-IN-SobhanaNeural",
	my: "my-MM-NilarNeural",
	no: "nb-NO-PernilleNeural",
	pl: "pl-PL-AgnieszkaNeural",
	pt: "pt-BR-FranciscaNeural",
	ro: "ro-RO-AlinaNeural",
	ru: "ru-RU-SvetlanaNeural",
	sk: "sk-SK-ViktoriaNeural",
	sv: "sv-SE-SofieNeural",
	ta: "ta-IN-PallaviNeural",
	te: "te-IN-ShrutiNeural",
	th: "th-TH-PremwadeeNeural",
	tr: "tr-TR-EmelNeural",
	ur: "ur-PK-UzmaNeural",
	vi: "vi-VN-HoaiMyNeural",
	zh: "zh-CN-XiaoxiaoNeural"
};
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const WINDOWS_FILE_TIME_EPOCH = 11644473600n;
function rateToString(rate) {
	const pct = Math.round((rate - 1) * 100);
	return pct >= 0 ? `+${pct}%` : `${pct}%`;
}
async function edgeSynthesize(text, voice, rate, pitch, volume, outputFormat, signal) {
	signal?.throwIfAborted();
	const chromeMajor = CHROMIUM_FULL_VERSION.split(".")[0];
	const wsUrl = await buildWsUrl();
	const socket = await WebSocket.connect(wsUrl, {
		host: "speech.platform.bing.com",
		origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
		"User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36 Edg/${chromeMajor}.0.0.0`
	}).catch((error) => {
		throw _formatEdgeError(error);
	});
	return new Promise((resolve, reject) => {
		const chunks = [];
		const onAbort = () => {
			socket.close();
			reject(signal?.reason ?? /* @__PURE__ */ new Error("Aborted"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		const settle = (fn) => {
			signal?.removeEventListener("abort", onAbort);
			fn();
		};
		socket.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"${outputFormat}"}}}}`);
		const requestId = randomHex(16);
		const ssml = buildSsml(text, voice, rate, pitch, volume);
		socket.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
		socket.onmessage = ({ data, isBinary }) => {
			if (isBinary) {
				const idx = data.indexOf("Path:audio\r\n");
				if (idx !== -1) chunks.push(data.subarray(idx + 12));
			} else if (data.toString().includes("Path:turn.end")) {
				socket.close();
				settle(() => resolve(Buffer.concat(chunks)));
			}
		};
		socket.onerror = (err) => {
			settle(() => reject(_formatEdgeError(err)));
		};
	});
}
function toHex(bytes) {
	return [...new Uint8Array(bytes instanceof Uint8Array ? bytes.buffer : bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(length) {
	return toHex(crypto.getRandomValues(new Uint8Array(length)));
}
async function generateSecMsGecToken() {
	const ticks = BigInt(Math.floor(Date.now() / 1e3 + Number(WINDOWS_FILE_TIME_EPOCH))) * 10000000n;
	const roundedTicks = ticks - ticks % 3000000000n;
	const data = new TextEncoder().encode(`${roundedTicks}${TRUSTED_CLIENT_TOKEN}`);
	return toHex(await crypto.subtle.digest("SHA-256", data)).toUpperCase();
}
async function buildWsUrl() {
	return `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${await generateSecMsGecToken()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`;
}
const VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
function escapeXml(str) {
	return str.replace(/[<>&"']/g, (c) => {
		switch (c) {
			case "<": return "&lt;";
			case ">": return "&gt;";
			case "&": return "&amp;";
			case "\"": return "&quot;";
			case "'": return "&apos;";
			default: return c;
		}
	});
}
function buildSsml(text, voice, rate, pitch, volume) {
	return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="${escapeXml(voice)}">
    <prosody rate="${escapeXml(rate)}" pitch="${escapeXml(pitch)}" volume="${escapeXml(volume)}">
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`;
}
function _formatEdgeError(error) {
	const message = error instanceof Error ? error.message : String(error);
	if (/getaddrinfo\s+EAI_AGAIN\s+speech\.platform\.bing\.com/i.test(message)) return /* @__PURE__ */ new Error("Edge TTS DNS lookup failed for speech.platform.bing.com. Network access or DNS resolution is unavailable right now.");
	if (/getaddrinfo\s+ENOTFOUND\s+speech\.platform\.bing\.com/i.test(message)) return /* @__PURE__ */ new Error("Edge TTS could not resolve speech.platform.bing.com. Check DNS, firewall, or internet connectivity.");
	if (/speech\.platform\.bing\.com/i.test(message)) return /* @__PURE__ */ new Error(`Edge TTS network error: ${message}`);
	if (/WebSocket error/i.test(message)) return new Error(message);
	return /* @__PURE__ */ new Error(`Edge TTS error: ${message}`);
}
//#endregion
export { buildSsml as a, generateSecMsGecToken as c, VOICES_URL as i, EdgeTTS as n, buildWsUrl as o, TRUSTED_CLIENT_TOKEN as r, escapeXml as s, CHROMIUM_FULL_VERSION as t };
