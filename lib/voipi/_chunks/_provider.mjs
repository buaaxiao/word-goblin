//#region src/_utils.ts
function getNodeBuiltin(id) {
	const mod = globalThis.process?.getBuiltinModule?.(id);
	if (!mod) throw new Error(`${id} module not available`);
	return mod;
}
function exec(cmd, args, options) {
	const { execFile } = getNodeBuiltin("node:child_process");
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { signal: options?.signal }, (error, stdout, stderr) => {
			if (error) reject(error);
			else resolve({
				stdout,
				stderr
			});
		});
	});
}
function which(cmd) {
	return exec("which", [cmd]).then(() => true).catch(() => false);
}
function execPipe(cmd, args, input, options) {
	const { spawn } = getNodeBuiltin("node:child_process");
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			stdio: [
				"pipe",
				"ignore",
				options?.captureStderr ? "pipe" : "ignore"
			],
			signal: options?.signal
		});
		let stderr = "";
		let settled = false;
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});
		child.stderr?.on("data", (chunk) => {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			stderr += text;
			if (_isAudioBackendError(stderr)) child.kill("SIGTERM");
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			if (code === 0 && !_isAudioBackendError(stderr)) {
				resolve();
				return;
			}
			reject(new Error(_formatPlaybackError(cmd, code, stderr)));
		});
		const stdin = child.stdin;
		if (!stdin) {
			settled = true;
			reject(/* @__PURE__ */ new Error(`${cmd} stdin unavailable`));
			return;
		}
		if (input) stdin.end(input);
		else stdin.end();
	});
}
/** Resolve a voice preference (string or prioritized list) against available voices. */
async function resolveVoice(voice, listVoices, hasVoice) {
	if (!voice) return void 0;
	if (typeof voice === "string") return voice;
	if (hasVoice) {
		const match = voice.find((v) => hasVoice(v));
		if (match) return match;
	}
	if (listVoices) {
		const available = new Set((await listVoices()).map((v) => v.id));
		const match = voice.find((v) => available.has(v));
		if (match) return match;
	}
	return voice[0];
}
async function playAudio(input, signal) {
	if ("data" in input && process.platform === "linux") return execPipe("ffplay", [
		"-nodisp",
		"-autoexit",
		"pipe:0"
	], input.data, {
		captureStderr: true,
		signal
	});
	let tmpFile;
	let filePath;
	if ("path" in input) filePath = input.path;
	else {
		const { tmpdir } = getNodeBuiltin("node:os");
		const { join } = getNodeBuiltin("node:path");
		const ext = input.ext ?? ".mp3";
		const hex = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
		tmpFile = join(tmpdir(), `voipi-${hex}${ext}`);
		await getNodeBuiltin("node:fs/promises").writeFile(tmpFile, input.data);
		filePath = tmpFile;
	}
	try {
		const player = process.platform === "darwin" ? "afplay" : process.platform === "win32" ? "powershell" : "ffplay";
		const args = process.platform === "win32" ? ["-c", `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`] : process.platform === "linux" ? [
			"-nodisp",
			"-autoexit",
			filePath
		] : [filePath];
		if (process.platform === "linux") await execPipe(player, args, void 0, {
			captureStderr: true,
			signal
		});
		else await exec(player, args, { signal });
	} finally {
		if (tmpFile) await getNodeBuiltin("node:fs/promises").unlink(tmpFile).catch(() => {});
	}
}
function _isAudioBackendError(stderr) {
	return /pw_context_connect\(\) failed/i.test(stderr) || /pa_context_connect\(\) failed/i.test(stderr) || /pa_write\(\) failed/i.test(stderr) || /connection refused/i.test(stderr) || /operation not permitted/i.test(stderr);
}
function _formatPlaybackError(cmd, code, stderr) {
	const detail = stderr.trim().split("\n").map((line) => line.trim()).find((line) => line.length > 0 && _isAudioBackendError(line));
	if (detail) return `Audio playback unavailable: ${detail}`;
	if (stderr.trim()) return `${cmd} failed: ${stderr.trim()}`;
	return code == null ? `${cmd} failed` : `${cmd} exited with code ${code}`;
}
//#endregion
//#region src/_audio.ts
/**
* Audio duration utilities.
*
* - `getAudioDuration()` — parse actual audio buffer (WAV/AIFF exact, MP3 estimated)
* - `estimateSpeechDuration()` — text-based heuristic before synthesis
*/
/** Average words-per-minute for TTS engines at rate=1.0 */
const DEFAULT_WPM = 150;
/** Estimate speaking duration (seconds) from text before synthesis. */
function estimateSpeechDuration(text, rate = 1) {
	return text.split(/\s+/).filter(Boolean).length / (DEFAULT_WPM * rate / 60);
}
/**
* Get audio duration in seconds from a raw buffer.
* Supports WAV, AIFF, and MP3 (estimated from size + assumed bitrate).
*/
function getAudioDuration(data, ext) {
	switch (ext?.replace(".", "").toLowerCase()) {
		case "wav": return wavDuration(data);
		case "aiff":
		case "aif": return aiffDuration(data);
		case "mp3": return mp3Duration(data);
		default: return;
	}
}
function wavDuration(buf) {
	if (buf.length < 44) return void 0;
	if (buf.toString("ascii", 0, 4) !== "RIFF") return void 0;
	const channels = buf.readUInt16LE(22);
	const sampleRate = buf.readUInt32LE(24);
	const bitsPerSample = buf.readUInt16LE(34);
	if (!sampleRate || !channels || !bitsPerSample) return void 0;
	let dataSize;
	for (let i = 36; i < buf.length - 8; i++) if (buf[i] === 100 && buf[i + 1] === 97 && buf[i + 2] === 116 && buf[i + 3] === 97) {
		const claimed = buf.readUInt32LE(i + 4);
		dataSize = Math.min(claimed, buf.length - i - 8);
		break;
	}
	if (dataSize === void 0) return void 0;
	const bytesPerSample = bitsPerSample / 8 * channels;
	return dataSize / (sampleRate * bytesPerSample);
}
function aiffDuration(buf) {
	if (buf.length < 12) return void 0;
	if (buf.toString("ascii", 0, 4) !== "FORM") return void 0;
	const formType = buf.toString("ascii", 8, 12);
	if (formType !== "AIFF" && formType !== "AIFC") return void 0;
	for (let i = 12; i < buf.length - 26; i++) if (buf[i] === 67 && buf[i + 1] === 79 && buf[i + 2] === 77 && buf[i + 3] === 77) {
		const numFrames = buf.readUInt32BE(i + 10);
		const sampleRate = readIeee80(buf, i + 16);
		if (sampleRate > 0) return numFrames / sampleRate;
		break;
	}
}
/** Read 80-bit IEEE 754 extended precision (big-endian). */
function readIeee80(buf, offset) {
	const exponent = (buf[offset] & 127) << 8 | buf[offset + 1];
	const mantissa = buf.readUInt32BE(offset + 2) * 2 ** 32 + buf.readUInt32BE(offset + 6);
	if (exponent === 0 && mantissa === 0) return 0;
	return mantissa * 2 ** (exponent - 16383 - 63);
}
/** Estimate MP3 duration from buffer size. Tries to read first frame header for bitrate. */
function mp3Duration(buf) {
	for (let i = 0; i < Math.min(buf.length, 4096); i++) if (buf[i] === 255 && (buf[i + 1] & 224) === 224) {
		const bitrate = parseMp3Bitrate(buf.readUInt32BE(i));
		if (bitrate > 0) return buf.length * 8 / (bitrate * 1e3);
	}
	return buf.length * 8 / (48 * 1e3);
}
const MP3_BITRATES_V1_L3 = [
	0,
	32,
	40,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	160,
	192,
	224,
	256,
	320,
	0
];
function parseMp3Bitrate(header) {
	return MP3_BITRATES_V1_L3[header >> 12 & 15] ?? 0;
}
//#endregion
//#region src/_provider.ts
/**
* Base class for providers that generate audio data.
* Subclasses implement `synthesize()` — this class handles speak/save/toAudio.
*/
var BaseVoiceProvider = class {
	/** Return provider defaults for logging (voice, rate, etc.) */
	getDefaults() {
		return {};
	}
	async speak(text, options) {
		await playAudio(await this.synthesize(text, options), options?.signal);
	}
	async save(text, outputFile, options) {
		const audio = await this.synthesize(text, options);
		await getNodeBuiltin("node:fs/promises").writeFile(outputFile, audio.data);
	}
	async toAudio(text, options) {
		const audio = await this.synthesize(text, options);
		audio.duration ??= getAudioDuration(audio.data, audio.ext);
		return audio;
	}
};
//#endregion
export { getNodeBuiltin as a, which as c, exec as i, estimateSpeechDuration as n, playAudio as o, getAudioDuration as r, resolveVoice as s, BaseVoiceProvider as t };
