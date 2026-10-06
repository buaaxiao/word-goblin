//#region src/_lang.ts
/**
* Detect the most likely language of text based on Unicode script analysis.
* Returns an ISO 639-1 language code (e.g. "ar", "fa", "zh", "ja", "ko", "hi").
* Falls back to "en" for Latin/unrecognized scripts.
*/
function detectLanguage(text) {
	const scores = {};
	let arabicTotal = 0;
	let farsiChars = 0;
	let urduChars = 0;
	for (const char of text) {
		const cp = char.codePointAt(0);
		if (isArabicScript(cp)) {
			arabicTotal++;
			if (cp === 1662 || cp === 1670 || cp === 1688 || cp === 1711) farsiChars++;
			if (cp === 1657 || cp === 1672 || cp === 1681 || cp === 1722 || cp === 1746) urduChars++;
			continue;
		}
		const lang = classifyCodepoint(cp);
		if (lang) scores[lang] = (scores[lang] ?? 0) + 1;
	}
	if (arabicTotal > 0) {
		const lang = farsiChars > urduChars ? "fa" : urduChars > 0 ? "ur" : "ar";
		scores[lang] = arabicTotal;
	}
	if (scores.ja && scores.zh) {
		scores.ja += scores.zh;
		delete scores.zh;
	}
	let best = "en";
	let bestCount = 0;
	for (const [lang, count] of Object.entries(scores)) if (count > bestCount) {
		best = lang;
		bestCount = count;
	}
	if (best === "en") {
		const latin = detectLatinLanguage(text);
		if (latin) return latin;
	}
	return best;
}
function isArabicScript(cp) {
	return cp >= 1536 && cp <= 1791 || cp >= 1872 && cp <= 1919 || cp >= 2208 && cp <= 2303 || cp >= 64336 && cp <= 65023 || cp >= 65136 && cp <= 65279;
}
const latinSignatures = [
	[
		"éèêëàâîïôùûœæ",
		"fr",
		1
	],
	[
		"ç",
		"fr",
		2
	],
	[
		"ñ¿¡",
		"es",
		2
	],
	[
		"áóúéí",
		"es",
		.5
	],
	[
		"ßäöü",
		"de",
		2
	],
	[
		"ãõ",
		"pt",
		2
	],
	[
		"çáéêó",
		"pt",
		.5
	],
	[
		"ğşıİ",
		"tr",
		2
	],
	[
		"ąęłńśźżó",
		"pl",
		1.5
	],
	[
		"ůřžďťň",
		"cs",
		2
	],
	[
		"ůřžďťň",
		"sk",
		1
	],
	[
		"ăâîșț",
		"ro",
		2
	],
	[
		"åæø",
		"da",
		2
	],
	[
		"åäö",
		"sv",
		2
	],
	[
		"åæø",
		"no",
		1.5
	],
	[
		"đơưăâêếềểễệốồổỗộắằẳẵặứừửữự",
		"vi",
		2
	]
];
function detectLatinLanguage(text) {
	const scores = {};
	const lower = text.toLowerCase();
	for (const char of lower) for (const [chars, lang, weight] of latinSignatures) if (chars.includes(char)) scores[lang] = (scores[lang] ?? 0) + weight;
	let best;
	let bestScore = 0;
	for (const [lang, score] of Object.entries(scores)) if (score > bestScore) {
		best = lang;
		bestScore = score;
	}
	return bestScore >= 2 ? best : void 0;
}
function classifyCodepoint(cp) {
	if (cp >= 19968 && cp <= 40959) return "zh";
	if (cp >= 13312 && cp <= 19903) return "zh";
	if (cp >= 12352 && cp <= 12447) return "ja";
	if (cp >= 12448 && cp <= 12543) return "ja";
	if (cp >= 44032 && cp <= 55215) return "ko";
	if (cp >= 4352 && cp <= 4607) return "ko";
	if (cp >= 2304 && cp <= 2431) return "hi";
	if (cp >= 1024 && cp <= 1279) return "ru";
	if (cp >= 3584 && cp <= 3711) return "th";
	if (cp >= 2432 && cp <= 2559) return "bn";
	if (cp >= 2944 && cp <= 3071) return "ta";
	if (cp >= 3072 && cp <= 3199) return "te";
	if (cp >= 3200 && cp <= 3327) return "kn";
	if (cp >= 3328 && cp <= 3455) return "ml";
	if (cp >= 2688 && cp <= 2815) return "gu";
	if (cp >= 4096 && cp <= 4255) return "my";
	if (cp >= 6016 && cp <= 6143) return "km";
	if (cp >= 3456 && cp <= 3583) return "si";
	if (cp >= 1424 && cp <= 1535) return "he";
	if (cp >= 880 && cp <= 1023) return "el";
	if (cp >= 4256 && cp <= 4351) return "ka";
	if (cp >= 1328 && cp <= 1423) return "hy";
}
//#endregion
export { detectLanguage as t };
